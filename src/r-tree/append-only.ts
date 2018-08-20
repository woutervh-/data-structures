import { Bounded, Bounds, area, combine, enclose, overlap, margin, intersection, intersects } from './bounds';

export type LeafHeight = 1;

export interface LeafEntry<Data> extends Bounded {
    data: Data;
}

export interface LeafNode<Data> {
    type: 'leaf';
    height: LeafHeight;
    entries: LeafEntry<Data>[];
}

export interface BranchEntry<Pointer> extends Bounded {
    pointer: Pointer;
    count: number;
}

export interface BranchNode<Pointer> {
    type: 'branch';
    height: number;
    entries: BranchEntry<Pointer>[];
}

export interface RootNode<Pointer> {
    type: 'root';
    height: number;
    pointer: Pointer;
}

export type TreeNode<Data, Pointer> = RootNode<Pointer> | BranchNode<Pointer> | LeafNode<Data>;

export type Entry<Data, Pointer> = LeafEntry<Data> | BranchEntry<Pointer>;

export interface Tree<Data, Pointer> {
    root: Pointer;
    store: LogStore<TreeNode<Data, Pointer>, Pointer>;
    dimensions: number;
    minimumEntries: number;
    maximumEntries: number;
}

export interface LogStore<LogEntry, Pointer> {
    append(data: LogEntry): Promise<Pointer>;
    get(pointer: Pointer): Promise<LogEntry>;
}

interface LinkRoot<Pointer> {
    pointer: Pointer;
    node: RootNode<Pointer>;
}

interface LinkBranch<Pointer> {
    index: number;
    pointer: Pointer;
    node: BranchNode<Pointer>;
}

interface LinkLowNode<Data, Pointer> {
    index: number;
    pointer: Pointer;
    node: LowNode<Data, Pointer>;
}

interface LinkLeaf<Data, Pointer> {
    pointer: Pointer;
    node: LeafNode<Data>;
}

interface LeafPath<Data, Pointer> {
    root: LinkRoot<Pointer>;
    branches: LinkBranch<Pointer>[];
    leaf: LinkLeaf<Data, Pointer>;
}

interface EntryPath<Data, Pointer> extends LeafPath<Data, Pointer> {
    index: number;
}

interface Split<Data, Pointer> {
    bounds: Bounds;
    entries: Entry<Data, Pointer>[];
}

type LowNode<Data, Pointer> = BranchNode<Pointer> | LeafNode<Data>;

const leafHeight: LeafHeight = 1;

function chooseSubtreeEA<Data, Pointer>(tree: Tree<Data, Pointer>, node: BranchNode<Pointer>, bounds: Bounds): number {
    // Check enlargement and area.
    let minArea = Number.POSITIVE_INFINITY;
    let minAreaEnlargement = Number.POSITIVE_INFINITY;
    let selectedIndex: number | undefined = undefined;
    for (let i = 0; i < node.entries.length; i++) {
        const entry = node.entries[i];
        const entryArea = area(entry.bounds, tree.dimensions);
        const entryAreaEnlargement = area(combine(entry.bounds, bounds, tree.dimensions), tree.dimensions) - entryArea;
        if (entryAreaEnlargement < minAreaEnlargement || entryAreaEnlargement === minAreaEnlargement && entryArea < minArea) {
            minArea = entryArea;
            minAreaEnlargement = entryAreaEnlargement;
            selectedIndex = i;
        }
    }
    if (selectedIndex === undefined) {
        throw new Error('Could not select entry index.');
    }
    return selectedIndex;
}

function chooseSubtreeOEA<Data, Pointer>(tree: Tree<Data, Pointer>, node: BranchNode<Pointer>, bounds: Bounds): number {
    // Check overlap, enlargement, and area.
    const allBounds = node.entries.map((entry) => entry.bounds);
    const allBoundsNew = [...allBounds, bounds];
    let minArea = Number.POSITIVE_INFINITY;
    let minAreaEnlargement = Number.POSITIVE_INFINITY;
    let minOverlapEnlargement = Number.POSITIVE_INFINITY;
    let selectedIndex: number | undefined = undefined;
    for (let i = 0; i < node.entries.length; i++) {
        const entry = node.entries[i];
        const entryArea = area(entry.bounds, tree.dimensions);
        const entryAreaEnlargement = area(combine(entry.bounds, bounds, tree.dimensions), tree.dimensions) - entryArea;
        const entryOverlapEnlargement = overlap(allBoundsNew, entry.bounds, tree.dimensions) - overlap(allBounds, entry.bounds, tree.dimensions);
        if (
            entryOverlapEnlargement < minOverlapEnlargement
            || entryOverlapEnlargement === minOverlapEnlargement &&
            (
                entryAreaEnlargement < minAreaEnlargement
                || entryAreaEnlargement === minAreaEnlargement && entryArea < minArea
            )
        ) {
            minArea = entryArea;
            minAreaEnlargement = entryAreaEnlargement;
            minOverlapEnlargement = entryOverlapEnlargement;
            selectedIndex = i;
        }
    }
    if (selectedIndex === undefined) {
        throw new Error('Could not select entry index.');
    }
    return selectedIndex;
}

function chooseSubtree<Data, Pointer>(tree: Tree<Data, Pointer>, node: BranchNode<Pointer>, bounds: Bounds): number {
    if (node.height === leafHeight + 1) {
        return chooseSubtreeOEA(tree, node, bounds);
    } else {
        return chooseSubtreeEA(tree, node, bounds);
    }
}

async function chooseLeaf<Data, Pointer>(tree: Tree<Data, Pointer>, bounds: Bounds): Promise<LeafPath<Data, Pointer>> {
    const root = await tree.store.get(tree.root);
    if (root.type !== 'root') {
        throw new Error('Root is not an actual root.');
    }
    const linkRoot: LinkRoot<Pointer> = { pointer: tree.root, node: root };
    const linkBranches: LinkBranch<Pointer>[] = [];
    let pointer: Pointer = tree.root;
    let node: TreeNode<Data, Pointer> = root;
    while (node.type !== 'leaf') {
        if (node.type === 'root') {
            pointer = node.pointer;
            node = await tree.store.get(pointer);
        } else {
            const selectedIndex = chooseSubtree(tree, node, bounds);
            if (selectedIndex === undefined) {
                throw new Error('Could not select entry index.');
            }
            linkBranches.push({ index: selectedIndex, pointer, node });
            pointer = node.entries[selectedIndex].pointer;
            node = await tree.store.get(pointer);
        }
    }
    const linkLeaf: LinkLeaf<Data, Pointer> = { pointer, node };
    return {
        root: linkRoot,
        branches: linkBranches,
        leaf: linkLeaf
    };
}

function pickSeeds<Data, Pointer>(tree: Tree<Data, Pointer>, entries: LeafEntry<Data>[]): [LeafEntry<Data>, LeafEntry<Data>];
function pickSeeds<Data, Pointer>(tree: Tree<Data, Pointer>, entries: BranchEntry<Data>[]): [BranchEntry<Data>, BranchEntry<Data>];
function pickSeeds<Data, Pointer>(tree: Tree<Data, Pointer>, entries: Entry<Data, Pointer>[]): [Entry<Data, Pointer>, Entry<Data, Pointer>];
function pickSeeds<Data, Pointer>(tree: Tree<Data, Pointer>, entries: Entry<Data, Pointer>[]): [Entry<Data, Pointer>, Entry<Data, Pointer>] {
    let maxWastedArea = Number.NEGATIVE_INFINITY;
    let pair: [Entry<Data, Pointer>, Entry<Data, Pointer>] | undefined = undefined;
    for (let i = 0; i < entries.length; i++) {
        for (let j = 0; j < entries.length; j++) {
            if (i !== j) {
                const areaA = area(entries[i].bounds, tree.dimensions);
                const areaB = area(entries[j].bounds, tree.dimensions);
                const areaAB = area(combine(entries[i].bounds, entries[j].bounds, tree.dimensions), tree.dimensions);
                if (areaAB - areaA - areaB > maxWastedArea) {
                    pair = [entries[i], entries[j]];
                    maxWastedArea = areaAB - areaA - areaB;
                }
            }
        }
    }
    if (pair === undefined) {
        throw new Error('Failed to select pair.');
    } else {
        return pair;
    }
}

function pickNext<Data, Pointer>(tree: Tree<Data, Pointer>, left: Bounded, right: Bounded, entries: Set<LeafEntry<Data>>): LeafEntry<Data>;
function pickNext<Data, Pointer>(tree: Tree<Data, Pointer>, left: Bounded, right: Bounded, entries: Set<BranchEntry<Data>>): BranchEntry<Data>;
function pickNext<Data, Pointer>(tree: Tree<Data, Pointer>, left: Bounded, right: Bounded, entries: Set<Entry<Data, Pointer>>): Entry<Data, Pointer>;
function pickNext<Data, Pointer>(tree: Tree<Data, Pointer>, left: Bounded, right: Bounded, entries: Set<Entry<Data, Pointer>>): Entry<Data, Pointer> {
    let maxDifference = Number.NEGATIVE_INFINITY;
    let selectedEntry: Entry<Data, Pointer> | undefined = undefined;
    const leftArea = area(left.bounds, tree.dimensions);
    const rightArea = area(right.bounds, tree.dimensions);
    for (const entry of entries) {
        const leftAreaDifference = area(combine(left.bounds, entry.bounds, tree.dimensions), tree.dimensions) - leftArea;
        const rightAreaDifference = area(combine(right.bounds, entry.bounds, tree.dimensions), tree.dimensions) - rightArea;
        const difference = Math.abs(leftAreaDifference - rightAreaDifference);
        if (difference > maxDifference) {
            selectedEntry = entry;
        }
    }
    if (selectedEntry === undefined) {
        throw new Error('Failed to select node.');
    } else {
        return selectedEntry;
    }
}

function rStarSplit<Data, Pointer>(tree: Tree<Data, Pointer>, entries: LeafEntry<Data>[]): [LeafEntry<Data>[], LeafEntry<Data>[]];
function rStarSplit<Data, Pointer>(tree: Tree<Data, Pointer>, entries: BranchEntry<Pointer>[]): [BranchEntry<Pointer>[], BranchEntry<Pointer>[]];
function rStarSplit<Data, Pointer>(tree: Tree<Data, Pointer>, entries: Entry<Data, Pointer>[]): [Entry<Data, Pointer>[], Entry<Data, Pointer>[]];
function rStarSplit<Data, Pointer>(tree: Tree<Data, Pointer>, entries: Entry<Data, Pointer>[]): [Entry<Data, Pointer>[], Entry<Data, Pointer>[]] {
    let minAxisMargin = Number.POSITIVE_INFINITY;
    let selectedAxis: number | undefined = undefined;
    // Choose split axis
    for (let i = 0; i < tree.dimensions; i++) {
        let axisMargin: number = 0;
        const sortedLower = entries.sort((a, b) => a.bounds[i * 2] - b.bounds[i * 2]);
        const sortedUpper = entries.sort((a, b) => a.bounds[i * 2 + 1] - b.bounds[i * 2 + 1]);
        const sortedEntries = [sortedLower, sortedUpper];
        for (let j = 0; j < 2; j++) {
            for (let k = 1; k <= tree.maximumEntries - 2 * tree.minimumEntries + 2; k++) {
                const left = sortedEntries[j].slice();
                const right = left.splice(tree.minimumEntries - 1 + k);
                const boundsLeft = enclose(left.map((entry) => entry.bounds), tree.dimensions);
                const boundsRight = enclose(right.map((entry) => entry.bounds), tree.dimensions);
                const marginLeft = margin(boundsLeft, tree.dimensions);
                const marginRight = margin(boundsRight, tree.dimensions);
                axisMargin += marginLeft + marginRight;
            }
        }
        if (axisMargin < minAxisMargin) {
            minAxisMargin = axisMargin;
            selectedAxis = i;
        }
    }
    if (selectedAxis === undefined) {
        throw new Error('Could not select split axis.');
    }
    // Choose split index
    const axis = selectedAxis;
    const sortedLower = entries.sort((a, b) => a.bounds[axis * 2] - b.bounds[axis * 2]);
    const sortedUpper = entries.sort((a, b) => a.bounds[axis * 2 + 1] - b.bounds[axis * 2 + 1]);
    const sortedEntries = [sortedLower, sortedUpper];
    let selectedSplit: [Entry<Data, Pointer>[], Entry<Data, Pointer>[]] | undefined = undefined;
    let minAxisArea: number = Number.POSITIVE_INFINITY;
    let minAxisOverlap: number = Number.POSITIVE_INFINITY;
    for (let j = 0; j < 2; j++) {
        for (let k = 1; k <= tree.maximumEntries - 2 * tree.minimumEntries + 2; k++) {
            const left = sortedEntries[j].slice();
            const right = left.splice(tree.minimumEntries - 1 + k);
            const boundsLeft = enclose(left.map((entry) => entry.bounds), tree.dimensions);
            const boundsRight = enclose(right.map((entry) => entry.bounds), tree.dimensions);
            const areaLeft = area(boundsLeft, tree.dimensions);
            const areaRight = area(boundsRight, tree.dimensions);
            const distributionArea = areaLeft + areaRight;
            const distributionOverlap = area(intersection(boundsLeft, boundsRight, tree.dimensions), tree.dimensions);
            if (distributionOverlap < minAxisOverlap || distributionOverlap === minAxisOverlap && distributionArea < minAxisArea) {
                minAxisArea = distributionArea;
                minAxisOverlap = distributionOverlap;
                selectedSplit = [left, right];
            }
        }
    }
    if (selectedSplit === undefined) {
        throw new Error('Could not select split index.');
    } else {
        return selectedSplit;
    }
}

function quadraticSplit<Data, Pointer>(tree: Tree<Data, Pointer>, entries: LeafEntry<Data>[]): [LeafEntry<Data>[], LeafEntry<Data>[]];
function quadraticSplit<Data, Pointer>(tree: Tree<Data, Pointer>, entries: BranchEntry<Pointer>[]): [BranchEntry<Pointer>[], BranchEntry<Pointer>[]];
function quadraticSplit<Data, Pointer>(tree: Tree<Data, Pointer>, entries: Entry<Data, Pointer>[]): [Entry<Data, Pointer>[], Entry<Data, Pointer>[]];
function quadraticSplit<Data, Pointer>(tree: Tree<Data, Pointer>, entries: Entry<Data, Pointer>[]): [Entry<Data, Pointer>[], Entry<Data, Pointer>[]] {
    const seeds = pickSeeds(tree, entries);
    const left: Split<Data, Pointer> = {
        bounds: seeds[0].bounds,
        entries: [seeds[0]]
    };
    const right: Split<Data, Pointer> = {
        bounds: seeds[1].bounds,
        entries: [seeds[1]]
    };
    const candidates = new Set(entries.filter((entry) => entry !== seeds[0] && entry !== seeds[1]));
    while (candidates.size >= 1) {
        let addTo: Split<Data, Pointer>;
        let next: Entry<Data, Pointer>;
        if (left.entries.length + candidates.size === tree.minimumEntries) {
            next = candidates.values().next().value;
            addTo = left;
        } else if (right.entries.length + candidates.size === tree.minimumEntries) {
            next = candidates.values().next().value;
            addTo = right;
        } else {
            next = pickNext(tree, left, right, candidates);
            const leftAreaBefore = area(left.bounds, tree.dimensions)
            const rightAreaBefore = area(right.bounds, tree.dimensions)
            const enlargementLeft = area(combine(left.bounds, next.bounds, tree.dimensions), tree.dimensions) - leftAreaBefore;
            const enlargementRight = area(combine(right.bounds, next.bounds, tree.dimensions), tree.dimensions) - rightAreaBefore;
            if (enlargementLeft < enlargementRight) {
                addTo = left;
            } else if (enlargementLeft > enlargementRight) {
                addTo = right;
            } else {
                if (leftAreaBefore < rightAreaBefore) {
                    addTo = left;
                } else if (leftAreaBefore > rightAreaBefore) {
                    addTo = right;
                } else {
                    if (left.entries.length < right.entries.length) {
                        addTo = left;
                    } else {
                        addTo = right;
                    }
                }
            }
        }
        addTo.entries.push(next);
        addTo.bounds = combine(addTo.bounds, next.bounds, tree.dimensions);
        candidates.delete(next);
    }
    return [left.entries, right.entries];
}

export async function chooseNibling<Data, Pointer>(tree: Tree<Data, Pointer>, bounds: Bounds, parentEntry: LinkBranch<Pointer>): Promise<[LinkBranch<Pointer>, LinkLowNode<Data, Pointer>]> {
    // TODO: may want to consider only comparing niblings of a single sibling, to avoid async page accesses. Will need some heuristic to choose best sibling.
    let maxArea = Number.NEGATIVE_INFINITY;
    let minAreaEnlargement = Number.POSITIVE_INFINITY;
    let linkSibling: LinkBranch<Pointer> | undefined = undefined;
    let linkNibling: LinkLowNode<Data, Pointer> | undefined = undefined;
    const entryCountMin = tree.minimumEntries ** (parentEntry.node.height - 1 - leafHeight + 1);
    for (let i = 0; i < parentEntry.node.entries.length; i++) {
        const siblingEntry = parentEntry.node.entries[i];
        if (siblingEntry.count > entryCountMin) {
            const sibling = await tree.store.get(siblingEntry.pointer);
            if (sibling.type === 'root') {
                throw new Error('Sibling is not expected to be root.');
            }
            for (let j = 0; j < sibling.entries.length; j++) {
                const niblingEntry = sibling.entries[j];
                const niblingEntryArea = area(niblingEntry.bounds, tree.dimensions);
                const niblingEntryAreaEnlargement = area(combine(niblingEntry.bounds, bounds, tree.dimensions), tree.dimensions) - area(bounds, tree.dimensions);
                if (niblingEntryAreaEnlargement < minAreaEnlargement || niblingEntryAreaEnlargement === minAreaEnlargement && niblingEntryArea > maxArea) {
                    maxArea = niblingEntryArea;
                    minAreaEnlargement = niblingEntryAreaEnlargement;
                    linkSibling = {
                        index: i,
                        node: parentEntry.node,
                        pointer: parentEntry.pointer
                    };
                    linkNibling = {
                        index: j,
                        node: sibling,
                        pointer: siblingEntry.pointer
                    };
                }
            }
        }
    }
    if (linkSibling === undefined || linkNibling === undefined) {
        throw new Error('Could not select sibling to steal from.');
    } else {
        return [linkSibling, linkNibling];
    }
}

export async function condenseTree<Data, Pointer>(tree: Tree<Data, Pointer>, path: EntryPath<Data, Pointer>, n1: LowNode<Data, Pointer>): Promise<LowNode<Data, Pointer>> {
    // TODO: case that root = n1
    let parent: LinkBranch<Pointer> | undefined = undefined;
    while ((parent = path.branches.pop()) !== undefined) {
        const parentEntries = [...parent.node.entries];
        const n1Entries: Bounded[] = n1.entries;
        if (n1.entries.length === tree.minimumEntries - 1) {
            // This node has too few entries after deletion.
            // Check if parent has enough entries underneath it.
            const parentCount = parent.node.entries.reduce((total, entry) => entry.count + total, 0);
            const parentCountMin = tree.minimumEntries ** (parent.node.height - leafHeight + 1);
            if (parentCount - 1 < parentCountMin) {
                // Parent node is now too empty, it too needs to be purged.
                // TODO: implement
            } else {
                // Parent still has enough nodes underneath it.
                // We will steal a node from one of the siblings.
                const n1Bounds = enclose(n1Entries.map((entry) => entry.bounds), tree.dimensions);
                const [sibling, nibling] = await chooseNibling(tree, n1Bounds, parent);
                n1Entries.push(nibling.node.entries[nibling.index]);
                const n2Entries: Bounded[] = nibling.node.entries.slice();
                n2Entries.splice(nibling.index, 1);
                const n2: LowNode<Data, Pointer> = Object.assign({}, nibling.node, { entries: n2Entries });
                parentEntries[parent.index] = {
                    bounds: enclose(n1Entries.map((entry) => entry.bounds), tree.dimensions),
                    pointer: await tree.store.append(n1),
                    count: n1.type === 'leaf' ? n1.entries.length : n1.entries.reduce((total, entry) => entry.count + total, 0)
                };
                parentEntries[sibling.index] = {
                    bounds: enclose(n2Entries.map((entry) => entry.bounds), tree.dimensions),
                    pointer: await tree.store.append(n2),
                    count: n2.type === 'leaf' ? n2.entries.length : n2.entries.reduce((total, entry) => entry.count + total, 0)
                };
                n1 = {
                    type: 'branch',
                    entries: parentEntries,
                    height: parent.node.height
                };
            }
        } else if (n1.entries.length >= tree.minimumEntries) {
            // This node still has enough entries.
            parentEntries[parent.index] = {
                bounds: enclose(n1Entries.map((entry) => entry.bounds), tree.dimensions),
                pointer: await tree.store.append(n1),
                count: n1.type === 'leaf' ? n1.entries.length : n1.entries.reduce((total, entry) => entry.count + total, 0)
            };
            n1 = {
                type: 'branch',
                entries: parentEntries,
                height: parent.node.height
            };
        } else {
            throw new Error('More than one entry was removed.');
        }
    }
    return n1;
}

async function adjustTree<Data, Pointer>(tree: Tree<Data, Pointer>, path: LeafPath<Data, Pointer>, n1: LowNode<Data, Pointer>, n2: LowNode<Data, Pointer> | undefined): Promise<[LowNode<Data, Pointer>, LowNode<Data, Pointer> | undefined]> {
    let parent: LinkBranch<Pointer> | undefined = undefined;
    while ((parent = path.branches.pop()) !== undefined) {
        const parentEntries = [...parent.node.entries];
        const n1Entries: Bounded[] = n1.entries;
        parentEntries[parent.index] = {
            bounds: enclose(n1Entries.map((entry) => entry.bounds), tree.dimensions),
            pointer: await tree.store.append(n1),
            count: n1.type === 'leaf' ? n1.entries.length : n1.entries.reduce((total, entry) => entry.count + total, 0)
        };
        if (n2) {
            const n2Entries: Bounded[] = n2.entries;
            parentEntries.push({
                bounds: enclose(n2Entries.map((entry) => entry.bounds), tree.dimensions),
                pointer: await tree.store.append(n2),
                count: n2.type === 'leaf' ? n2.entries.length : n2.entries.reduce((total, entry) => entry.count + total, 0)
            });
        }
        if (parentEntries.length <= tree.maximumEntries) {
            n1 = {
                type: 'branch',
                height: n1.height + 1,
                entries: parentEntries
            };
            n2 = undefined;
        } else {
            const [p, pp] = rStarSplit(tree, parentEntries);
            n1 = {
                type: 'branch',
                height: n1.height + 1,
                entries: p
            };
            n2 = {
                type: 'branch',
                height: n1.height + 1,
                entries: pp
            };
        }
    }
    return [n1, n2];
}

export async function insert<Data, Pointer>(tree: Tree<Data, Pointer>, entry: LeafEntry<Data>): Promise<Pointer> {
    const path = await chooseLeaf(tree, entry.bounds);
    const entries = [...path.leaf.node.entries, entry];
    let n1: LeafNode<Data>;
    let n2: LeafNode<Data> | undefined;
    if (path.leaf.node.entries.length < tree.maximumEntries) {
        n1 = {
            type: 'leaf',
            height: leafHeight,
            entries
        };
        n2 = undefined;
    } else {
        const split = rStarSplit(tree, entries);
        n1 = {
            type: 'leaf',
            height: leafHeight,
            entries: split[0]
        };
        n2 = {
            type: 'leaf',
            height: leafHeight,
            entries: split[1]
        };
    }
    const [r1, r2] = await adjustTree(tree, path, n1, n2);
    let rootNode: LowNode<Data, Pointer>;
    if (r2) {
        const r1Entries: Bounded[] = r1.entries;
        const r2Entries: Bounded[] = r2.entries;
        rootNode = {
            type: 'branch',
            height: r1.height + 1,
            entries: [{
                bounds: enclose(r1Entries.map((entry) => entry.bounds), tree.dimensions),
                pointer: await tree.store.append(r1),
                count: r1.type === 'leaf' ? r1.entries.length : r1.entries.reduce((total, entry) => entry.count + total, 0)
            }, {
                bounds: enclose(r2Entries.map((entry) => entry.bounds), tree.dimensions),
                pointer: await tree.store.append(r2),
                count: r2.type === 'leaf' ? r2.entries.length : r2.entries.reduce((total, entry) => entry.count + total, 0)
            }]
        };
    } else {
        rootNode = r1;
    }
    return tree.store.append({
        type: 'root',
        height: r1.height,
        pointer: await tree.store.append(rootNode)
    });
}

async function findEntryLowNode<Data, Pointer>(tree: Tree<Data, Pointer>, pointer: Pointer, searchEntry: LeafEntry<Data>, equals: (a: LeafEntry<Data>, b: LeafEntry<Data>) => boolean = (a, b) => a.data === b.data): Promise<Pick<EntryPath<Data, Pointer>, 'branches' | 'leaf' | 'index'> | undefined> {
    const node = await tree.store.get(pointer);
    if (node.type === 'branch') {
        for (let i = 0; i < node.entries.length; i++) {
            const entry = node.entries[i];
            if (intersects(entry.bounds, searchEntry.bounds, tree.dimensions)) {
                // Consideration: depth-first search, one by one, awaiting promises, or:
                // all-at-once search, using Promise.all, to fetch all candidate entries in parallel.
                // The former results in less store.get accesses, the latter could find the entry faster.
                const result = await findEntryLowNode(tree, entry.pointer, searchEntry, equals);
                if (result) {
                    return {
                        branches: [{ index: i, pointer, node }, ...result.branches],
                        index: result.index,
                        leaf: result.leaf
                    };
                }
            }
        }
    } else if (node.type === 'leaf') {
        const result = node.entries.findIndex((entry) => equals(entry, searchEntry));
        if (result >= 0) {
            return {
                branches: [],
                index: result,
                leaf: { node, pointer }
            };
        } else {
            return undefined;
        }
    }
}

export async function findEntry<Data, Pointer>(tree: Tree<Data, Pointer>, pointer: Pointer, searchEntry: LeafEntry<Data>, equals: (a: LeafEntry<Data>, b: LeafEntry<Data>) => boolean = (a, b) => a.data === b.data): Promise<EntryPath<Data, Pointer> | undefined> {
    const node = await tree.store.get(pointer);
    if (node.type === 'root') {
        const result = await findEntryLowNode(tree, node.pointer, searchEntry, equals);
        if (result !== undefined) {
            return {
                ...result,
                root: { node, pointer }
            };
        }
    }
}

export async function remove<Data, Pointer>(tree: Tree<Data, Pointer>, searchEntry: LeafEntry<Data>, equals: (a: LeafEntry<Data>, b: LeafEntry<Data>) => boolean = (a, b) => a.data === b.data): Promise<Pointer | undefined> {
    const path = await findEntry(tree, tree.root, searchEntry, equals);
    if (path) {
        const n1Entries = path.leaf.node.entries.slice();
        n1Entries.splice(path.index, 1);
        const n1: LeafNode<Data> = {
            type: 'leaf',
            height: leafHeight,
            entries: n1Entries
        };
        const rootNode = await condenseTree(tree, path, n1);
        return tree.store.append({
            type: 'root',
            height: rootNode.height,
            pointer: await tree.store.append(rootNode)
        });
    }
}

export async function search<Data, Pointer>(tree: Tree<Data, Pointer>, pointer: Pointer, searchBounds: Bounds): Promise<Data[]> {
    const node = await tree.store.get(pointer);
    if (node.type === 'root') {
        return search(tree, node.pointer, searchBounds);
    } else if (node.type === 'branch') {
        const searchResults = await Promise.all(
            node.entries
                .filter((entry) => intersects(entry.bounds, searchBounds, tree.dimensions))
                .map((entry) => search(tree, entry.pointer, searchBounds))
        );
        const dataResults: Data[] = [];
        for (const result of searchResults) {
            dataResults.push(...result);
        }
        return dataResults;
    } else {
        return node.entries
            .filter((entry) => intersects(entry.bounds, searchBounds, tree.dimensions))
            .map((entry) => entry.data);
    }
}

export async function makeTree<Data, Pointer>(store: LogStore<TreeNode<Data, Pointer>, Pointer>, dimensions: number, minimumEntries: number, maximumEntries: number): Promise<Tree<Data, Pointer>> {
    const rootPointer = await store.append({
        type: 'root',
        height: leafHeight + 1,
        pointer: await store.append({
            type: 'leaf',
            height: leafHeight,
            entries: []
        })
    });
    return {
        root: rootPointer,
        store,
        dimensions,
        minimumEntries,
        maximumEntries
    };
}
