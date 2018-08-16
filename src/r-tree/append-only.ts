import { Bounded, Bounds, intersects, area, combine, enclose, overlap } from './bounds';

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

const leafHeight: LeafHeight = 1;

// function chooseSubtree<Data, Pointer>(tree: Tree<Data, Pointer>, node: BranchNode<Pointer>, bounds: Bounds): number {
//     let minArea = Number.POSITIVE_INFINITY;
//     let minAreaEnlargement = Number.POSITIVE_INFINITY;
//     let selectedIndex: number | undefined = undefined;
//     for (let i = 0; i < node.entries.length; i++) {
//         const entry = node.entries[i];
//         const entryArea = area(entry.bounds, tree.dimensions);
//         const entryAreaEnlargement = area(combine(entry.bounds, bounds, tree.dimensions), tree.dimensions) - entryArea;
//         if (entryAreaEnlargement < minAreaEnlargement || entryAreaEnlargement === minAreaEnlargement && entryArea < minArea) {
//             minArea = entryArea;
//             minAreaEnlargement = entryAreaEnlargement;
//             selectedIndex = i;
//         }
//     }
//     if (selectedIndex === undefined) {
//         throw new Error('Could not select entry index.');
//     }
//     return selectedIndex;
// }

function chooseSubtree<Data, Pointer>(tree: Tree<Data, Pointer>, node: BranchNode<Pointer>, bounds: Bounds): number {
    if (node.height === leafHeight + 1) {
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
            // TODO: also compare area of rectangle if rest is equal
            if (entryOverlapEnlargement < minOverlapEnlargement || entryOverlapEnlargement === minOverlapEnlargement && entryAreaEnlargement < minAreaEnlargement) {
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
}

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
    let parent: LinkBranch<Pointer> | undefined = undefined;
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
            n1 = {
                type: 'branch',
                height: n1.height + 1,
                entries: parentEntries
            };
            n2 = undefined;
        } else {
            const [p, pp] = quadraticSplit(tree, parentEntries);
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
        const split = quadraticSplit(tree, entries);
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
    let rootBranch: LowNode<Data, Pointer>;
    if (r2) {
        const r1Entries: Bounded[] = r1.entries;
        const r2Entries: Bounded[] = r2.entries;
        rootBranch = {
            type: 'branch',
            height: r1.height + 1,
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
    return await tree.store.append({
        type: 'root',
        height: r1.height,
        pointer: await tree.store.append(rootBranch)
    });
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
                    .filter((entry) => intersects(entry.bounds, searchBounds, tree.dimensions))
                    .map((entry) => entry.pointer)
            );
        } else {
            result.push(
                ...node.entries
                    .filter((entry) => intersects(entry.bounds, searchBounds, tree.dimensions))
                    .map((entry) => entry.data)
            );
        }
    }
    return result;
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

// (async () => {
//     const backingStore: TreeNode<string, number>[] = [];
//     const store: LogStore<TreeNode<string, number>, number> = {
//         async append(data: TreeNode<string, number>) {
//             return backingStore.push(data) - 1;
//         },
//         async get(pointer: number) {
//             return backingStore[pointer];
//         }
//     };

//     let tree = await makeTree(store, 2, 2, 4);
//     tree = await insert(tree, { bounds: [0, 0, 1, 1], data: 'P1' });
//     tree = await insert(tree, { bounds: [1, 1, 2, 2], data: 'P2' });
//     tree = await insert(tree, { bounds: [2, 2, 3, 3], data: 'P3' });
//     tree = await insert(tree, { bounds: [3, 3, 4, 4], data: 'P4' });
//     tree = await insert(tree, { bounds: [4, 4, 5, 5], data: 'P5' });
//     debugger;
// })();
