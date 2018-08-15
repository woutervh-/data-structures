import { Bounded, Bounds, overlaps, area, combine, enclose } from './bounds';

export interface LeafEntry<Data> extends Bounded {
    data: Data;
}

export interface LeafNode<Data> {
    type: 'leaf';
    entries: LeafEntry<Data>[];
}

export interface BranchEntry<Pointer> extends Bounded {
    pointer: Pointer;
}

export interface BranchNode<Pointer> {
    type: 'branch';
    entries: BranchEntry<Pointer>[];
}

export interface RootNode<Pointer> {
    type: 'root';
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

interface LinkLeaf<Data, Pointer> {
    pointer: Pointer;
    node: LeafNode<Data>;
}

interface Path<Data, Pointer> {
    root: LinkRoot<Pointer>;
    branches: LinkBranch<Pointer>[];
    leaf: LinkLeaf<Data, Pointer>;
}

interface Split<Data, Pointer> {
    bounds: Bounds;
    entries: Entry<Data, Pointer>[];
}

type LowNode<Data, Pointer> = BranchNode<Pointer> | LeafNode<Data>;

async function chooseLeaf<Data, Pointer>(tree: Tree<Data, Pointer>, bounds: Bounds): Promise<Path<Data, Pointer>> {
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
            // Choose subtree
            let minArea = Number.POSITIVE_INFINITY;
            let minEnlargement = Number.POSITIVE_INFINITY;
            let selectedIndex: number | undefined = undefined;
            for (let i = 0; i < node.entries.length; i++) {
                const entry = node.entries[i];
                const entryArea = area(entry.bounds, tree.dimensions);
                const entryEnlargement = area(combine(entry.bounds, bounds, tree.dimensions), tree.dimensions);
                if (entryEnlargement < minEnlargement || entryEnlargement === minEnlargement && entryArea < minArea) {
                    minArea = entryArea;
                    minEnlargement = entryEnlargement;
                    selectedIndex = i;
                }
            }
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

async function adjustTree<Data, Pointer>(tree: Tree<Data, Pointer>, path: Path<Data, Pointer>, n1: LowNode<Data, Pointer>, n2: LowNode<Data, Pointer> | undefined): Promise<[LowNode<Data, Pointer>, LowNode<Data, Pointer> | undefined]> {
    let parent: LinkBranch<Pointer> | undefined;
    while ((parent = path.branches.pop()) !== undefined) {
        const parentEntries = [...parent.node.entries];
        const n1Entries: Bounded[] = n1.entries;
        parentEntries[parent.index] = {
            bounds: enclose(n1Entries.map((entry) => entry.bounds), tree.dimensions),
            pointer: await tree.store.append(n1)
        };
        if (n2) {
            const n2Entries: Bounded[] = n2.entries;
            parentEntries.push({
                bounds: enclose(n2Entries.map((entry) => entry.bounds), tree.dimensions),
                pointer: await tree.store.append(n2)
            });
        }
        if (parentEntries.length <= tree.maximumEntries) {
            n1 = parent.node;
            n2 = undefined;
        } else {
            const [p, pp] = quadraticSplit(tree, parentEntries);
            n1 = {
                type: 'branch',
                entries: p
            };
            n2 = {
                type: 'branch',
                entries: pp
            };
        }
    }
    return [n1, n2];
}

export async function insert<Data, Pointer>(tree: Tree<Data, Pointer>, entry: LeafEntry<Data>) {
    const path = await chooseLeaf(tree, entry.bounds);
    const entries = [...path.leaf.node.entries, entry];
    let n1: LeafNode<Data>;
    let n2: LeafNode<Data> | undefined;
    if (path.leaf.node.entries.length < tree.maximumEntries) {
        n1 = {
            type: 'leaf',
            entries
        };
        n2 = undefined;
    } else {
        const split = quadraticSplit(tree, entries);
        n1 = {
            type: 'leaf',
            entries: split[0]
        };
        n2 = {
            type: 'leaf',
            entries: split[1]
        };
    }
    const [r1, r2] = await adjustTree(tree, path, n1, n2);
    let rootBranch: LowNode<Data, Pointer>;
    if (r2) {
        const r1Entries: Bounded[] = r1.entries;
        const r2Entries: Bounded[] = r2.entries;
        rootBranch = {
            type: 'branch',
            entries: [{
                bounds: enclose(r1Entries.map((entry) => entry.bounds), tree.dimensions),
                pointer: await tree.store.append(r1)
            }, {
                bounds: enclose(r2Entries.map((entry) => entry.bounds), tree.dimensions),
                pointer: await tree.store.append(r2)
            }]
        };
    } else {
        rootBranch = r1;
    }
    const rootPointer = await tree.store.append({
        type: 'root',
        pointer: await tree.store.append(rootBranch)
    });
    return { ...tree, root: rootPointer };
}

export async function search<Data, Pointer>(tree: Tree<Data, Pointer>, searchBounds: Bounds): Promise<Data[]> {
    const stack = [tree.root];
    const result: Data[] = [];
    let pointer: Pointer | undefined = undefined;
    while ((pointer = stack.pop()) !== undefined) {
        const node = await tree.store.get(pointer);
        if (node.type === 'root') {
            stack.push(node.pointer);
        } else if (node.type === 'branch') {
            stack.push(
                ...node.entries
                    .filter((entry) => overlaps(entry.bounds, searchBounds, tree.dimensions))
                    .map((entry) => entry.pointer)
            );
        } else {
            result.push(
                ...node.entries
                    .filter((entry) => overlaps(entry.bounds, searchBounds, tree.dimensions))
                    .map((entry) => entry.data)
            );
        }
    }
    return result;
}

export async function makeTree<Data, Pointer>(store: LogStore<TreeNode<Data, Pointer>, Pointer>, dimensions: number, minimumEntries: number, maximumEntries: number): Promise<Tree<Data, Pointer>> {
    const rootPointer = await store.append({
        type: 'root',
        pointer: await store.append({
            type: 'leaf',
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
