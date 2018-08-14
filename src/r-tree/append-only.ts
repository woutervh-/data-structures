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

interface BlockStore<Data, Key> {
    get(key: Key): TreeNode<Data>;
    append(node: TreeNode<Data>): Key;
}
