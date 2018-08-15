import { Bounded, Bounds, overlaps, area, combine } from './bounds';

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
            node = await tree.store.get(node.pointer);
        } else {
            linkBranches.push({ pointer, node });
            // Choose subtree
            let minArea = Number.POSITIVE_INFINITY;
            let minEnlargement = Number.POSITIVE_INFINITY;
            const selectedEntry: BranchEntry<Pointer> = node.entries.reduce((selectedEntry, entry) => {
                const entryArea = area(entry.bounds, tree.dimensions);
                const entryEnlargement = area(combine(entry.bounds, bounds, tree.dimensions), tree.dimensions);
                if (entryEnlargement < minEnlargement || entryEnlargement === minEnlargement && entryArea < minArea) {
                    minArea = entryArea;
                    minEnlargement = entryEnlargement;
                    return entry;
                } else {
                    return selectedEntry;
                }
            });
            pointer = selectedEntry.pointer;
            node = await tree.store.get(selectedEntry.pointer);
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

function adjustTree<Data, Pointer>(tree: Tree<Data, Pointer>, path: Path<Data, Pointer>, n1: TreeNode<Data, Pointer>, n2: TreeNode<Data, Pointer> | undefined): [TreeNode<Data, Pointer>, TreeNode<Data, Pointer>] | undefined {
    let parent: BranchNode<Data> | undefined;
    while ((parent = path.branches.pop()) !== undefined) {
        if (parent === undefined) {
            throw new Error('Parent path too short.');
        }
        const n1Index = parent.entries.findIndex((entry) => entry.child === n1);
        const n1Entries: Bounded[] = n1.entries;
        parent.entries[n1Index].bounds = enclose(n1Entries.map((entry) => entry.bounds), tree.dimensions);
        n1 = parent;
        if (n2) {
            const n2Entries: Bounded[] = n2.entries;
            const entry: BranchEntry<Data> = {
                bounds: enclose(n2Entries.map((entry) => entry.bounds), tree.dimensions),
                child: n2
            };
            if (parent.entries.length < tree.maximumEntries) {
                parent.entries.push(entry);
                n2 = undefined;
            } else {
                parent.entries.push(entry);
                const [p, pp] = quadraticSplit(tree, parent.entries);
                parent.entries = p;
                n2 = {
                    type: 'branch',
                    entries: pp
                };
            }
        }
    }
    if (n2) {
        return [n1, n2];
    }
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
    adjustTree(tree, path, n1, n2);

    // const n1 = path.leaf;
    // let n2: LeafNode<Data> | undefined = undefined;
    // if (n1.entries.length < tree.maximumEntries) {
    //     n1.entries.push(entry);
    // } else {
    //     n1.entries.push(entry);
    //     const split = quadraticSplit(tree, n1.entries);
    //     n1.entries = split[0];
    //     n2 = {
    //         type: 'leaf',
    //         entries: split[1]
    //     };
    // }
    // const rootSplit = adjustTree(tree, path, n1, n2);
    // if (rootSplit) {
    //     tree.root = {
    //         type: 'branch',
    //         entries: rootSplit.map<BranchEntry<Data>>((node) => {
    //             const entries: Bounded[] = node.entries;
    //             return {
    //                 bounds: enclose(entries.map((entry) => entry.bounds), tree.dimensions),
    //                 child: node
    //             };
    //         })
    //     };
    // }
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

// export type Bounds = number[];

// export interface Bounded {
//     bounds: Bounds;
// }

// export interface LeafEntry<Data> extends Bounded {
//     data: Data;
// }

// export interface LeafNode<Data> {
//     type: 'leaf';
//     entries: LeafEntry<Data>[];
// }

// export interface BranchEntry<Data> extends Bounded {
//     child: TreeNode<Data>;
// }

// export interface BranchNode<Data> {
//     type: 'branch';
//     entries: BranchEntry<Data>[];
// }

// export type TreeNode<Data> = BranchNode<Data> | LeafNode<Data>;

// export interface Tree<Data> {
//     type: 'tree';
//     root: TreeNode<Data>;
//     dimensions: number;
//     minimumEntries: number;
//     maximumEntries: number;
// }

/**
 *
const util = require('util');
const appendTree = require('append-tree');
const hypercore = require('hypercore');
const ram = require('random-access-memory');
const feed = hypercore((filename) => ram())
const tree = appendTree(feed, {valueEncoding: 'utf-8'});

const put = util.promisify(tree.put).bind(tree);
const get = util.promisify(tree.get).bind(tree);
const list = util.promisify(tree.list).bind(tree);

(async function() {
    try {
        await put('/root/branch/leaf1', 'P1');
        await put('/root/branch/leaf2', 'P2');
        console.log(await get('/root/branch/leaf1'));
    } catch (error) {
        console.error(error);
    }
})();

 */
