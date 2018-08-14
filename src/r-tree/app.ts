import { Tree, insert, TreeNode, search, Bounds } from './index';
import './style.css';

const colors = [
    'rgb(1, 22, 39)',
    'rgb(170, 0, 0)',
    'rgb(46, 196, 182)',
    'rgb(255, 204, 0)',
    'rgb(169, 155, 242)'
];

// const myTree = makeTree<string>(2, 4);
const myTree: Tree<string> = { "root": { "type": "branch", "entries": [{ "bounds": [257, 859, 107, 439], "child": { "type": "branch", "entries": [{ "bounds": [689, 693, 107, 439], "child": { "type": "leaf", "entries": [{ "bounds": [693, 693, 107, 107], "data": "P4" }, { "bounds": [689, 689, 439, 439], "data": "P5" }] } }, { "bounds": [610, 859, 276, 408], "child": { "type": "leaf", "entries": [{ "bounds": [859, 859, 376, 376], "data": "P6" }, { "bounds": [610, 610, 408, 408], "data": "P8" }, { "bounds": [806, 806, 276, 276], "data": "P3" }] } }, { "bounds": [257, 601, 118, 339], "child": { "type": "leaf", "entries": [{ "bounds": [490, 490, 118, 118], "data": "P1" }, { "bounds": [601, 601, 324, 324], "data": "P7" }, { "bounds": [257, 257, 339, 339], "data": "P6" }, { "bounds": [401, 401, 269, 269], "data": "P2" }] } }] } }, { "bounds": [1037, 1507, 118, 442], "child": { "type": "branch", "entries": [{ "bounds": [1431, 1507, 127, 380], "child": { "type": "leaf", "entries": [{ "bounds": [1431, 1431, 127, 127], "data": "P4" }, { "bounds": [1507, 1507, 380, 380], "data": "P3" }] } }, { "bounds": [1037, 1359, 118, 442], "child": { "type": "leaf", "entries": [{ "bounds": [1037, 1037, 422, 422], "data": "P2" }, { "bounds": [1359, 1359, 442, 442], "data": "P5" }, { "bounds": [1146, 1146, 293, 293], "data": "P1" }, { "bounds": [1054, 1054, 118, 118], "data": "P7" }] } }] } }] }, "dimensions": 2, "minimumEntries": 2, "maximumEntries": 4 };

let counter = 0;
let searchBounds: Bounds | undefined = undefined;

const context = (function () {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context === null) {
        throw new Error('Failed to get 2D context.');
    } else {
        let down = false;
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let currentY = 0;

        function onMouseDown(event: MouseEvent) {
            dragging = false;
            down = true;
            startX = currentX = event.clientX;
            startY = currentY = event.clientY;
        }

        function onMouseMove(event: MouseEvent) {
            if (down) {
                currentX = event.clientX;
                currentY = event.clientY;
                if (Math.abs(currentX - startX) + Math.abs(currentY - startY) >= 5) {
                    dragging = true;
                    searchBounds = [Math.min(startX, currentX), Math.max(startX, currentX), Math.min(startY, currentY), Math.max(startY, currentY)];
                }
            }
        }

        function onMouseUp(event: MouseEvent) {
            if (down) {
                searchBounds = undefined;
                if (!dragging) {
                    insert(myTree, { bounds: [event.clientX, event.clientX, event.clientY, event.clientY], data: `P${++counter}` });
                }
            }
            down = false;
        }

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        document.body.appendChild(canvas);
        return context;
    }
})();

{
    const info = document.createElement('div');
    {
        const button = document.createElement('button');
        button.innerText = 'Log tree';
        button.addEventListener('click', () => console.log(JSON.parse(JSON.stringify(myTree))));
        info.appendChild(button);
    }
    {
        const button = document.createElement('button');
        button.innerText = 'Insert 1000 random';
        button.addEventListener('click', () => {
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                const x = context.canvas.width * Math.random();
                const y = context.canvas.height * Math.random();
                insert(myTree, { bounds: [x, x, y, y], data: `P${++counter}` });
            }
            const end = performance.now();
            console.log(end - start);
        });
        info.appendChild(button);
    }
    document.body.appendChild(info);
}

function renderSearchBox(context: CanvasRenderingContext2D) {
    if (searchBounds) {
        context.lineWidth = 2;
        context.strokeStyle = 'grey';
        context.beginPath();
        context.setLineDash([5, 15]);
        context.rect(searchBounds[0], searchBounds[2], searchBounds[1] - searchBounds[0], searchBounds[3] - searchBounds[2]);
        context.stroke();
        context.closePath();
    }
}

function renderLegend(context: CanvasRenderingContext2D) {
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

function renderNode(context: CanvasRenderingContext2D, node: TreeNode<string>, depth: number) {
    context.lineWidth = 2;
    context.setLineDash([])
    context.font = '24px serif';
    context.textAlign = 'start';
    context.textBaseline = 'top';

    if (node.type === 'leaf') {
        for (const entry of node.entries) {
            // TODO: only render if not in search results
            context.beginPath();
            context.arc(entry.bounds[0], entry.bounds[2], 4, 0, 2 * Math.PI);
            context.fill();
            context.closePath();
            context.fillText(entry.data, entry.bounds[0], entry.bounds[2]);
        }
    } else {
        for (const entry of node.entries) {
            renderNode(context, entry.child, depth + 1);
        }
    }

    context.fillStyle = colors[depth % colors.length];
    context.strokeStyle = colors[depth % colors.length];
    for (const entry of node.entries) {
        context.beginPath();
        context.rect(entry.bounds[0], entry.bounds[2], (entry.bounds[1] - entry.bounds[0]), (entry.bounds[3] - entry.bounds[2]));
        context.stroke();
        context.closePath();
    }
}

function render(context: CanvasRenderingContext2D) {
    context.save();
    renderLegend(context);
    renderSearchBox(context);
    renderNode(context, myTree.root, 0);
    context.restore();
}

function loop() {
    const { width, height } = context.canvas.getBoundingClientRect();
    context.canvas.width = width;
    context.canvas.height = height;
    context.clearRect(0, 0, width, height);

    render(context);

    window.requestAnimationFrame(loop);
}

loop();
