export type Bounds = number[];

export interface Bounded {
    bounds: Bounds;
}

export interface LeafEntry<Data> extends Bounded {
    data: Data;
}

export interface LeafNode<Data> {
    type: 'leaf';
    entries: LeafEntry<Data>[];
}

export interface BranchEntry<Data> extends Bounded {
    child: TreeNode<Data>;
}

export interface BranchNode<Data> {
    type: 'branch';
    entries: BranchEntry<Data>[];
}

export type TreeNode<Data> = BranchNode<Data> | LeafNode<Data>;

export interface Tree<Data> {
    root: TreeNode<Data>;
    dimensions: number;
    minimumEntries: number;
    maximumEntries: number;
}

export interface LeafPath<Data> {
    branches: BranchNode<Data>[];
    leaf: LeafNode<Data>;
}

export type Entry<Data> = LeafEntry<Data> | BranchEntry<Data>;

function overlaps(a: Bounds, b: Bounds, dimensions: number): boolean {
    // Checks if bounds overlap (inclusively borders)
    for (let i = 0; i < dimensions; i++) {
        if (a[i * 2] > b[i * 2 + 1] || a[i * 2 + 1] < b[i * 2]) {
            return false;
        }
    }
    return true;
}

function area(bounds: Bounds, dimensions: number): number {
    let area = 1;
    for (let i = 0; i < dimensions; i++) {
        area *= bounds[i * 2 + 1] - bounds[i * 2];
    }
    return area;
}

function combine(a: Bounds, b: Bounds, dimensions: number): Bounds {
    const bounds: Bounds = [];
    for (let i = 0; i < dimensions; i++) {
        bounds[i * 2] = Math.min(a[i * 2], b[i * 2]);
        bounds[i * 2 + 1] = Math.max(a[i * 2 + 1], b[i * 2 + 1]);
    }
    return bounds;
}

function enclose(boundsList: Bounds[], dimensions: number): Bounds {
    const bounds: Bounds = [];
    for (let i = 0; i < dimensions; i++) {
        bounds[i * 2] = Math.min(...boundsList.map((bounds) => bounds[i * 2]));
        bounds[i * 2 + 1] = Math.max(...boundsList.map((bounds) => bounds[i * 2 + 1]));
    }
    return bounds;
}

function chooseLeaf<Data>(tree: Tree<Data>, bounds: Bounds): LeafPath<Data> {
    const path: BranchNode<Data>[] = [];
    let node: TreeNode<Data> = tree.root;
    while (node.type !== 'leaf') {
        // Choose subtree
        let selectedEntry: BranchEntry<Data> | undefined = undefined;
        let minArea = Number.POSITIVE_INFINITY;
        let minEnlargement = Number.POSITIVE_INFINITY;
        for (let i = 0; i < node.entries.length; i++) {
            const entry = node.entries[i];
            const entryArea = area(entry.bounds, tree.dimensions);
            const entryEnlargement = area(combine(entry.bounds, bounds, tree.dimensions), tree.dimensions) - entryArea;
            if (entryEnlargement < minEnlargement || entryEnlargement === minEnlargement && entryArea < minArea) {
                selectedEntry = entry;
                minArea = entryArea;
                minEnlargement = entryEnlargement;
            }
        }
        if (selectedEntry === undefined) {
            throw new Error('No entry was selected.');
        }
        path.push(node);
        node = selectedEntry.child;
    }
    return { branches: path, leaf: node };
}

function pickSeeds<Data>(tree: Tree<Data>, entries: LeafEntry<Data>[]): [LeafEntry<Data>, LeafEntry<Data>];
function pickSeeds<Data>(tree: Tree<Data>, entries: BranchEntry<Data>[]): [BranchEntry<Data>, BranchEntry<Data>];
function pickSeeds<Data>(tree: Tree<Data>, entries: Entry<Data>[]): [Entry<Data>, Entry<Data>];
function pickSeeds<Data>(tree: Tree<Data>, entries: Entry<Data>[]): [Entry<Data>, Entry<Data>] {
    let maxWastedArea = Number.NEGATIVE_INFINITY;
    let pair: [Entry<Data>, Entry<Data>] | undefined = undefined;
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

function pickNext<Data>(tree: Tree<Data>, left: Bounded, right: Bounded, entries: Set<LeafEntry<Data>>): LeafEntry<Data>;
function pickNext<Data>(tree: Tree<Data>, left: Bounded, right: Bounded, entries: Set<BranchEntry<Data>>): BranchEntry<Data>;
function pickNext<Data>(tree: Tree<Data>, left: Bounded, right: Bounded, entries: Set<Entry<Data>>): Entry<Data>;
function pickNext<Data>(tree: Tree<Data>, left: Bounded, right: Bounded, entries: Set<Entry<Data>>): Entry<Data> {
    let maxDifference = Number.NEGATIVE_INFINITY;
    let selectedNode: Entry<Data> | undefined = undefined;
    const leftArea = area(left.bounds, tree.dimensions);
    const rightArea = area(right.bounds, tree.dimensions);
    for (const entry of entries) {
        const leftAreaDifference = area(combine(left.bounds, entry.bounds, tree.dimensions), tree.dimensions) - leftArea;
        const rightAreaDifference = area(combine(right.bounds, entry.bounds, tree.dimensions), tree.dimensions) - rightArea;
        const difference = Math.abs(leftAreaDifference - rightAreaDifference);
        if (difference > maxDifference) {
            selectedNode = entry;
        }
    }
    if (selectedNode === undefined) {
        throw new Error('Failed to select node.');
    } else {
        return selectedNode;
    }
}

function quadraticSplit<Data>(tree: Tree<Data>, entries: LeafEntry<Data>[]): [LeafEntry<Data>[], LeafEntry<Data>[]];
function quadraticSplit<Data>(tree: Tree<Data>, entries: BranchEntry<Data>[]): [BranchEntry<Data>[], BranchEntry<Data>[]];
function quadraticSplit<Data>(tree: Tree<Data>, entries: Entry<Data>[]): [Entry<Data>[], Entry<Data>[]];
function quadraticSplit<Data>(tree: Tree<Data>, entries: Entry<Data>[]): [Entry<Data>[], Entry<Data>[]] {
    interface Split extends Bounded {
        entries: Entry<Data>[];
    }

    const seeds = pickSeeds(tree, entries);
    const left: Split = {
        bounds: seeds[0].bounds,
        entries: [seeds[0]]
    };
    const right: Split = {
        bounds: seeds[1].bounds,
        entries: [seeds[1]]
    };
    const candidates = new Set(entries.filter((entry) => entry !== seeds[0] && entry !== seeds[1]));
    while (candidates.size >= 1) {
        let addTo: Split;
        let next: Entry<Data>;
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

function adjustTree<Data>(tree: Tree<Data>, path: LeafPath<Data>, n1: TreeNode<Data>, n2?: TreeNode<Data>): [TreeNode<Data>, TreeNode<Data>] | undefined {
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

export function height(tree: Tree<any>): number {
    let node: TreeNode<any> = tree.root;
    let height = 1;
    while (node.type !== 'leaf') {
        node = node.entries[0].child;
        height += 1;
    }
    return height;
}

export function insert<Data>(tree: Tree<Data>, entry: LeafEntry<Data>) {
    const path = chooseLeaf(tree, entry.bounds);
    const n1 = path.leaf;
    let n2: LeafNode<Data> | undefined = undefined;
    if (n1.entries.length < tree.maximumEntries) {
        n1.entries.push(entry);
    } else {
        n1.entries.push(entry);
        const split = quadraticSplit(tree, n1.entries);
        n1.entries = split[0];
        n2 = {
            type: 'leaf',
            entries: split[1]
        };
    }
    const rootSplit = adjustTree(tree, path, n1, n2);
    if (rootSplit) {
        tree.root = {
            type: 'branch',
            entries: rootSplit.map<BranchEntry<Data>>((node) => {
                const entries: Bounded[] = node.entries;
                return {
                    bounds: enclose(entries.map((entry) => entry.bounds), tree.dimensions),
                    child: node
                };
            })
        };
    }
}

export function search<Data>(tree: Tree<Data>, node: TreeNode<Data>, bounds: Bounds): Data[] {
    if (node.type === 'leaf') {
        return node.entries
            .filter((entry) => overlaps(bounds, entry.bounds, tree.dimensions))
            .map((entry) => entry.data);
    } else {
        return node.entries
            .filter((entry) => overlaps(bounds, entry.bounds, tree.dimensions))
            .map((entry) => search(tree, entry.child, bounds))
            .reduce((accumulator, data) => accumulator.concat(data), []);
    }
}

export function makeTree<Data>(dimensions: number, minimumEntries: number, maximumEntries: number): Tree<Data> {
    return {
        root: {
            type: 'leaf',
            entries: []
        },
        dimensions,
        minimumEntries,
        maximumEntries
    };
}
