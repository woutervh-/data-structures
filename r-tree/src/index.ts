type Bounds = number[];

type TreeNode<Pointer> = Branch<Pointer> | Leaf<Pointer>;

interface BranchChild<Pointer> {
    bounds: Bounds;
    node: TreeNode<Pointer>;
}

interface Branch<Pointer> {
    type: 'branch';
    children: BranchChild<Pointer>[];
}

interface LeafChild<Pointer> {
    bounds: Bounds;
    entry: Pointer;
}

interface Leaf<Pointer> {
    type: 'leaf';
    children: LeafChild<Pointer>[];
}

interface LeafParent<Pointer> {
    bounds: Bounds;
    node: Leaf<Pointer>;
}

interface LeafPath<Pointer> {
    parents: Branch<Pointer>[];
    leaf: Leaf<Pointer>;
}

interface Tree<Pointer> {
    root: TreeNode<Pointer>;
    dimensions: number;
    maximumEntries: number;
}

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

function search<Pointer>(tree: Tree<Pointer>, root: TreeNode<Pointer>, bounds: Bounds): Pointer[] {
    if (root.type === 'leaf') {
        return root.children
            .filter((child) => overlaps(bounds, child.bounds, tree.dimensions))
            .map((child) => child.entry);
    } else {
        return root.children
            .filter((child) => overlaps(bounds, child.bounds, tree.dimensions))
            .map((child) => search(tree, child.node, bounds))
            .reduce((accumulator, pointers) => accumulator.concat(pointers), []);
    }
}

function chooseLeaf<Pointer>(tree: Tree<Pointer>, bounds: Bounds): LeafPath<Pointer> {
    const parents: Branch<Pointer>[] = [];
    let node: TreeNode<Pointer> = tree.root;
    while (node.type !== 'leaf') {
        parents.push(node);
        // Choose subtree
        let selectedChild = node.children[0];
        let minArea = area(selectedChild.bounds, tree.dimensions);
        let minEnlargement = area(combine(selectedChild.bounds, bounds, tree.dimensions), tree.dimensions) - minArea;
        for (let i = 1; i < node.children.length; i++) {
            const child = node.children[i];
            const childArea = area(child.bounds, tree.dimensions);
            const childEnlargement = area(combine(child.bounds, bounds, tree.dimensions), tree.dimensions) - childArea;
            if (childEnlargement < minEnlargement || childEnlargement === minEnlargement && childArea < minArea) {
                selectedChild = child;
                minArea = childArea;
                minEnlargement = childEnlargement;
            }
        }
        node = selectedChild.node;
    }
    return { parents, leaf: node };
}

function pickSeeds<Pointer>(tree: Tree<Pointer>, entries: LeafChild<Pointer>[]): [LeafChild<Pointer>, LeafChild<Pointer>] {
    let maxWastedArea = Number.NEGATIVE_INFINITY;
    let pair: [LeafChild<Pointer>, LeafChild<Pointer>] | undefined = undefined;
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

function pickNext<Pointer>(tree: Tree<Pointer>, left: LeafParent<Pointer>, right: LeafParent<Pointer>, entries: Set<LeafChild<Pointer>>): LeafChild<Pointer> {
    let maxDifference = Number.NEGATIVE_INFINITY;
    let selectedNode: LeafChild<Pointer> | undefined = undefined;
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

function quadraticSplit<Pointer>(tree: Tree<Pointer>, leaf: Leaf<Pointer>): [LeafParent<Pointer>, LeafParent<Pointer>] {
    const seeds = pickSeeds(tree, leaf.children);
    const left: LeafParent<Pointer> = {
        bounds: seeds[0].bounds,
        node: {
            type: 'leaf',
            children: [seeds[0]]
        }
    };
    const right: LeafParent<Pointer> = {
        bounds: seeds[1].bounds,
        node: {
            type: 'leaf',
            children: [seeds[1]]
        }
    };
    const entries = new Set(leaf.children.filter((entry) => entry !== seeds[0] && entry !== seeds[1]));
    while (entries.size >= 1) {
        const next = pickNext(tree, left, right, entries);
        const leftAreaBefore = area(left.bounds, tree.dimensions)
        const rightAreaBefore = area(right.bounds, tree.dimensions)
        const enlargementLeft = area(combine(left.bounds, next.bounds, tree.dimensions), tree.dimensions) - leftAreaBefore;
        const enlargementRight = area(combine(right.bounds, next.bounds, tree.dimensions), tree.dimensions) - rightAreaBefore;
        let addTo: LeafParent<Pointer>;
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
                if (left.node.children.length < right.node.children.length) {
                    addTo = left;
                } else {
                    addTo = right;
                }
            }
        }
        addTo.node.children.push(next);
        addTo.bounds = combine(addTo.bounds, next.bounds, tree.dimensions);
        entries.delete(next);
    }
    return [left, right];
}

function adjustTree<Pointer>(tree: Tree<Pointer>, n1: Leaf<Pointer>, n2?: Leaf<Pointer>) {
    if (n1.parent !== null) {

    }
}

function insert<Pointer>(tree: Tree<Pointer>, child: LeafChild<Pointer>) {
    const path = chooseLeaf(tree, child.bounds);
    const leaf = path[path.length - 1];
    if (leaf.children.length < tree.maximumEntries) {
        leaf.children.push(child);
    } else {
        leaf.children.push(child);
        const split = quadraticSplit(tree, leaf);
    }
}

const myTree: Tree<string> = {
    root: {
        type: 'leaf',
        children: [{
            bounds: [0, 1, 0, 1],
            entry: 'R1'
        }]
    },
    dimensions: 2,
    maximumEntries: 4
};

console.log(search(myTree, myTree.root, [0, 10, 0, 10]));
