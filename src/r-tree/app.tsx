import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Draggable } from 'react-managed-draggable';
import timedMemoize from 'timed-memoize';
import { makeTree, LogStore, TreeNode, Tree, insert, search } from './append-only';
import { Bounds } from './bounds';
import './style.css';

const colors = [
    '#331a00',
    '#2288ee',
    '#cc11dd',
    '#db0e00',
    '#6e7700',
    '#44ba97',
    '#ff9977',
    '#aabb88',
    '#ffe7a0'
];

class MemoryLogStore implements LogStore<TreeNode<string, number>, number> {
    backingStore: TreeNode<string, number>[] = [];

    async append(data: TreeNode<string, number>) {
        return this.backingStore.push(data) - 1;
    }

    async get(pointer: number) {
        return this.backingStore[pointer];
    }
}

interface AppState {
    tree: Tree<string, number> | null;
    searchBounds: Bounds | null;
    drawBoxes: boolean;
    drawPointsAlways: boolean;
    drawPointLabels: boolean;
}

class App extends React.Component<{}, AppState> {
    counter = 0;

    store: LogStore<TreeNode<string, number>, number> = new MemoryLogStore();

    state: AppState = {
        tree: null,
        searchBounds: null,
        drawBoxes: true,
        drawPointLabels: true,
        drawPointsAlways: true
    };

    context: CanvasRenderingContext2D | null = null;

    raf: number | null = null;

    searchResults = timedMemoize(async (tree: Tree<string, number> | null, searchBounds: Bounds | null) => {
        if (searchBounds !== null && tree !== null) {
            return new Set(await search(tree, searchBounds));
        } else {
            return new Set([]);
        }
    }, { timeout: -1, one: true });

    async componentDidMount() {
        this.setState({ tree: await makeTree(this.store, 2, 2, 4) });
        this.raf = window.requestAnimationFrame(this.loop);
    }

    componentWillUnmount() {
        if (this.raf !== null) {
            window.cancelAnimationFrame(this.raf);
        }
    }

    loop = () => {
        if (this.context) {
            const { width, height } = this.context.canvas.getBoundingClientRect();
            this.context.canvas.width = width;
            this.context.canvas.height = height;
            this.context.clearRect(0, 0, width, height);
            this.draw(this.context);
        }
        this.raf = window.requestAnimationFrame(this.loop);
    };

    handleLogClick = () => {
        function formatSize(bytes: number): string {
            const sizes = ['bytes', 'KiB', 'MiB', 'GiB'];
            const factor = 1024;
            let index = 0;
            while (bytes >= factor && index < sizes.length) {
                bytes /= factor;
                index += 1;
            }
            return `${Math.round(bytes)} ${sizes[index]}`;
        }

        const stringified = JSON.stringify(this.state.tree);
        console.log(`${stringified.length} characters. Roughly ${formatSize(stringified.length)}.`);
        console.log(JSON.parse(stringified));
    };

    handleInsertClick = async () => {
        if (this.state.tree && this.context) {
            const tree = { ...this.state.tree };
            for (let i = 0; i < 1000; i++) {
                const x = this.context.canvas.width * Math.random();
                const y = this.context.canvas.height * Math.random();
                tree.root = await insert(tree, { bounds: [x, x, y, y], data: `P${++this.counter}` });
            }
            this.setState({ tree });
        }
    };

    handleClearClick = async () => {
        this.setState({ tree: await makeTree(this.store, 2, 2, 4) });
    };

    drawLegend(context: CanvasRenderingContext2D) {
        context.font = '24px serif';
        context.textAlign = 'center';
        context.textBaseline = 'top';
        for (let i = 0; i < colors.length; i++) {
            context.fillStyle = colors[i];
            context.beginPath();
            context.rect(5, 5 + 24 * i, 200, 24);
            context.fill();
            context.closePath();
            context.fillStyle = 'white';
            context.fillText(`Depth ${i + 1}`, 5 + 100, 5 + 24 * i);
        }
    }

    drawSearchBox(context: CanvasRenderingContext2D) {
        if (this.state.searchBounds) {
            const x = this.state.searchBounds[0];
            const y = this.state.searchBounds[2];
            const width = this.state.searchBounds[1] - this.state.searchBounds[0];
            const height = this.state.searchBounds[3] - this.state.searchBounds[2];
            context.lineWidth = 2;
            context.strokeStyle = 'grey';
            context.beginPath();
            context.setLineDash([5, 15]);
            context.rect(x, y, width, height);
            context.stroke();
            context.closePath();
        }
    }

    async drawNode(context: CanvasRenderingContext2D, tree: Tree<string, number>, pointer: number, depth: number) {
        context.lineWidth = 2;
        context.setLineDash([]);
        context.font = '24px serif';
        context.textAlign = 'start';
        context.textBaseline = 'top';
        context.fillStyle = colors[depth % colors.length];
        context.strokeStyle = colors[depth % colors.length];

        const node = await tree.store.get(pointer);
        if (node.type === 'root') {
            await this.drawNode(context, tree, node.pointer, depth);
        } else if (node.type === 'leaf') {
            for (const entry of node.entries) {
                const searchResults = await this.searchResults(this.state.tree, this.state.searchBounds);
                if (this.state.drawPointsAlways || searchResults.has(entry.data)) {
                    context.beginPath();
                    context.arc(entry.bounds[0], entry.bounds[2], 4, 0, 2 * Math.PI);
                    context.fill();
                    context.closePath();
                    if (this.state.drawPointLabels) {
                        context.fillText(entry.data, entry.bounds[0], entry.bounds[2]);
                    }
                }
            }
        } else {
            for (const entry of node.entries) {
                if (this.state.drawBoxes) {
                    context.fillStyle = colors[depth % colors.length];
                    context.strokeStyle = colors[depth % colors.length];
                    context.beginPath();
                    context.rect(entry.bounds[0], entry.bounds[2], (entry.bounds[1] - entry.bounds[0]), (entry.bounds[3] - entry.bounds[2]));
                    context.stroke();
                    context.closePath();
                }
                await this.drawNode(context, tree, entry.pointer, depth + 1);
            }
        }
    }

    async draw(context: CanvasRenderingContext2D) {
        context.save();
        this.drawLegend(context);
        this.drawSearchBox(context);
        if (this.state.tree) {
            await this.drawNode(context, this.state.tree, this.state.tree.root, 0);
        }
        context.restore();
    }

    render() {
        return <React.Fragment>
            <Draggable
                className="canvas-draggable"
                threshold={5}
                onDragMove={(event, information) => {
                    this.setState({ searchBounds: [information.start.x, information.current.x, information.start.y, information.current.y] });
                }}
                onDragEnd={() => {
                    this.setState({ searchBounds: null });
                }}
                onClick={async (event, information) => {
                    if (this.state.tree) {
                        const tree = { ...this.state.tree };
                        tree.root = await insert(tree, { bounds: [information.current.x, information.current.x, information.current.y, information.current.y], data: `P${++this.counter}` });
                        this.setState({ tree });
                    }
                }}
            >
                <canvas className="canvas" ref={(ref) => this.context = ref && ref.getContext('2d')} />
            </Draggable>
            <div>
                <label>
                    <input type="checkbox" checked={this.state.drawBoxes} onChange={() => this.setState({ drawBoxes: !this.state.drawBoxes })} />
                    Draw boxes
                </label>
                <label>
                    <input type="checkbox" checked={this.state.drawPointsAlways} onChange={() => this.setState({ drawPointsAlways: !this.state.drawPointsAlways })} />
                    Always draw points
                </label>
                <label>
                    <input type="checkbox" checked={this.state.drawPointLabels} onChange={() => this.setState({ drawPointLabels: !this.state.drawPointLabels })} />
                    Draw point labels
                </label>
                <button onClick={this.handleLogClick}>Log tree</button>
                <button onClick={this.handleInsertClick}>Insert 1,000 random</button>
                <button onClick={this.handleClearClick}>Clear</button>
            </div>
        </React.Fragment>;
    }
}

const container = document.createElement('div');
container.classList.add('container');
document.body.appendChild(container);

ReactDOM.render(<App />, container);
