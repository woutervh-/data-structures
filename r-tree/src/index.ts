type Bounds = number[];

interface Bounded {
    bounds: Bounds;
}

interface LeafEntry<Data> extends Bounded {
    data: Data;
}

interface LeafNode<Data> {
    type: 'leaf';
    entries: LeafEntry<Data>[];
}

interface BranchEntry<Data> extends Bounded {
    child: TreeNode<Data>;
}

interface BranchNode<Data> {
    type: 'branch';
    entries: BranchEntry<Data>[];
}

type TreeNode<Data> = BranchNode<Data> | LeafNode<Data>;

interface Tree<Data> {
    root: TreeNode<Data>;
    dimensions: number;
    maximumEntries: number;
}

interface LeafPath<Data> {
    branches: BranchNode<Data>[];
    leaf: LeafNode<Data>;
}

type Entry<Data> = LeafEntry<Data> | BranchEntry<Data>;

function overlaps(a: Bounds, b: Bounds, dimensions: number): boolean {
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

function search<Data>(tree: Tree<Data>, node: TreeNode<Data>, bounds: Bounds): Data[] {
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
        const next = pickNext(tree, left, right, candidates);
        const leftAreaBefore = area(left.bounds, tree.dimensions)
        const rightAreaBefore = area(right.bounds, tree.dimensions)
        const enlargementLeft = area(combine(left.bounds, next.bounds, tree.dimensions), tree.dimensions) - leftAreaBefore;
        const enlargementRight = area(combine(right.bounds, next.bounds, tree.dimensions), tree.dimensions) - rightAreaBefore;
        let addTo: Split;
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
        addTo.entries.push(next);
        addTo.bounds = combine(addTo.bounds, next.bounds, tree.dimensions);
        candidates.delete(next);
    }
    return [left.entries, right.entries];
}

function adjustTree<Data>(tree: Tree<Data>, path: LeafPath<Data>, n1: TreeNode<Data>, n2?: TreeNode<Data>) {
    while (tree.root !== n1) {
        const parent = path.branches.pop();
        if (parent === undefined) {
            throw new Error('Parent path too short.');
        }
        const n1Index = parent.entries.findIndex((entry) => entry.child === n1);
        const n1Entries: Bounded[] = n1.entries;
        parent.entries[n1Index].bounds = combine(parent.entries[n1Index].bounds, enclose(n1Entries.map((entry) => entry.bounds), tree.dimensions), tree.dimensions);
        if (n2) {
            const n2Entries: Bounded[] = n2.entries;
            const entry: BranchChild<Data> = {
                bounds: enclose(n2Entries.map((entry) => entry.bounds), tree.dimensions),
                node: n2
            };
            if (parent.children.length < tree.maximumEntries) {
                parent.children.push(entry);
                n1 = parent;
                n2 = undefined;
            } else {
                parent.children.push(entry);
                const [p, pp] = quadraticSplit(tree, parent);
                n1 = p;
                n2 = pp;
            }
        }
    }
}

function insert<Data>(tree: Tree<Data>, entry: LeafEntry<Data>) {
    const path = chooseLeaf(tree, entry.bounds);
    if (path.leaf.entries.length < tree.maximumEntries) {
        path.leaf.entries.push(entry);
    } else {
        path.leaf.entries.push(entry);
        const split = quadraticSplit(tree, path.leaf.entries);
    }
}

const myTree: Tree<string> = {
    root: {
        type: 'leaf',
        entries: [{
            bounds: [0, 1, 0, 1],
            data: 'R1'
        }]
    },
    dimensions: 2,
    maximumEntries: 4
};

console.log(search(myTree, myTree.root, [0, 10, 0, 10]));
