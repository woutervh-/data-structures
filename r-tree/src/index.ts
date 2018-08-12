type Bounds = number[];

type Root<Pointer> = Branch<Pointer> | Leaf<Pointer>;

interface BranchChild<Pointer> {
    bounds: Bounds;
    node: Branch<Pointer> | Leaf<Pointer>;
}

interface Branch<Pointer> {
    type: 'branch';
    children: BranchChild<Pointer>[];
}

interface LeafChild<Pointer> {
    bounds: Bounds;
    node: Pointer;
}

interface Leaf<Pointer> {
    type: 'leaf';
    children: LeafChild<Pointer>[];
}

interface Tree<Pointer> {
    root: Root<Pointer>;
    dimensions: number;
    maximumEntries: number;
}

function overlaps(a: Bounds, b: Bounds, dimensions: number) {
    for (let i = 0; i < dimensions; i++) {
        if (a[i * 2] > b[i * 2 + 1] || a[i * 2 + 1] < b[i * 2]) {
            return false;
        }
    }
    return true;
}

function area(bounds: Bounds, dimensions: number) {
    let area = 1;
    for (let i = 0; i < dimensions; i++) {
        area *= bounds[i * 2 + 1] - bounds[i * 2];
    }
    return area;
}

function combine(a: Bounds, b: Bounds, dimensions: number) {
    const bounds: Bounds = [];
    for (let i = 0; i < dimensions; i++) {
        bounds[i * 2] = Math.min(a[i * 2], b[i * 2]);
        bounds[i * 2 + 1] = Math.max(a[i * 2 + 1], b[i * 2 + 1]);
    }
    return bounds;
}

function search<Pointer>(tree: Tree<Pointer>, root: Root<Pointer>, bounds: Bounds): Pointer[] {
    if (root.type === 'leaf') {
        return root.children
            .filter((child) => overlaps(bounds, child.bounds, tree.dimensions))
            .map((child) => child.node);
    } else {
        return root.children
            .filter((child) => overlaps(bounds, child.bounds, tree.dimensions))
            .map((child) => search(tree, child.node, bounds))
            .reduce((accumulator, pointers) => accumulator.concat(pointers), []);
    }
}

function chooseLeaf(tree: Tree<any>, bounds: Bounds) {
    let node = tree.root;

    while (node.type !== 'leaf') {
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

    return node;
}

function insert<Pointer>(tree: Tree<Pointer>, child: LeafChild<Pointer>) {
    const leaf = chooseLeaf(tree, child.bounds);
    if (leaf.children.length < tree.maximumEntries) {
        leaf.children.push(child);
    } else {
        
    }
}

const myTree: Tree<string> = {
    root: {
        type: 'leaf',
        children: [{
            bounds: [0, 1, 0, 1],
            node: 'R1'
        }]
    },
    dimensions: 2,
    maximumEntries: 4
};

console.log(search(myTree, myTree.root, [0, 10, 0, 10]));
