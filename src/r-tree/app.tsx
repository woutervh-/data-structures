import * as React from 'react';
import { Tree, insert, TreeNode, search, makeTree } from './in-place';
import './style.css';
import { Bounds } from './bounds';
import './append-only';

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

let myTree = makeTree<string>(2, 2, 4);
let counter = 0;
let searchBounds: Bounds | undefined = undefined;
let searchResults: Set<string> | undefined = undefined;

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
                    searchResults = new Set(search(myTree, myTree.root, searchBounds));
                }
            }
        }

        function onMouseUp(event: MouseEvent) {
            if (down) {
                searchBounds = undefined;
                searchResults = undefined;
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
        button.addEventListener('click', () => {
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

            const stringified = JSON.stringify(myTree);
            console.log(`${stringified.length} characters. Roughly ${formatSize(stringified.length)}.`);
            console.log(JSON.parse(stringified));
        });
        info.appendChild(button);
    }
    {
        const button = document.createElement('button');
        button.innerText = 'Insert 100,000 random';
        button.addEventListener('click', () => {
            for (let i = 0; i < 100000; i++) {
                const x = context.canvas.width * Math.random();
                const y = context.canvas.height * Math.random();
                insert(myTree, { bounds: [x, x, y, y], data: `P${++counter}` });
            }
        });
        info.appendChild(button);
    }
    {
        const button = document.createElement('button');
        button.innerText = 'Clear';
        button.addEventListener('click', () => myTree = makeTree<string>(2, 2, 4));
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

    // TODO: check color, text doesn't make sense
    context.fillStyle = colors[depth % colors.length];
    context.strokeStyle = colors[depth % colors.length];

    if (node.type === 'leaf') {
        for (const entry of node.entries) {
            // if (searchResults === undefined || searchResults.has(entry.data)) {
            if (searchResults !== undefined && searchResults.has(entry.data)) {
                context.beginPath();
                context.arc(entry.bounds[0], entry.bounds[2], 4, 0, 2 * Math.PI);
                context.fill();
                context.closePath();
                // context.fillText(entry.data, entry.bounds[0], entry.bounds[2]);
            }
        }
    } else {
        for (const entry of node.entries) {
            // context.fillStyle = colors[depth % colors.length];
            // context.strokeStyle = colors[depth % colors.length];
            // context.beginPath();
            // context.rect(entry.bounds[0], entry.bounds[2], (entry.bounds[1] - entry.bounds[0]), (entry.bounds[3] - entry.bounds[2]));
            // context.stroke();
            // context.closePath();
            renderNode(context, entry.child, depth + 1);
        }
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
