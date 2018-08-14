import './style.css';

const context = (function () {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context === null) {
        throw new Error('Failed to get 2D context.');
    } else {
        document.body.appendChild(canvas);
        return context;
    }
})();

function renderGrid(context: CanvasRenderingContext2D) {
    const power = 4;
    const count = 2 ** power;
    context.beginPath();
    for (let i = 0; i < count - 1; i++) {
        context.moveTo((i + 1) / count * context.canvas.width, 0);
        context.lineTo((i + 1) / count * context.canvas.width, context.canvas.height);
    }
    for (let i = 0; i < count - 1; i++) {
        context.moveTo(0, (i + 1) / count * context.canvas.height);
        context.lineTo(context.canvas.width, (i + 1) / count * context.canvas.height);
    }
    context.stroke();
}

function loop() {
    const { width, height } = context.canvas.getBoundingClientRect();
    context.canvas.width = width;
    context.canvas.height = height;
    context.clearRect(0, 0, width, height);

    renderGrid(context);

    window.requestAnimationFrame(loop);
}

loop();
