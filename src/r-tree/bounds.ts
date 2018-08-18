export type Bounds = number[];

export interface Bounded {
    bounds: Bounds;
}

export function contains(a: Bounds, b: Bounds, dimensions: number): boolean {
    // Check if b is contained by a (borders inclusively)
    for (let i = 0; i < dimensions; i++) {
        if (a[i * 2] < b[i * 2] || a[i * 2 + 1] > b[i * 2 + 1]) {
            return false;
        }
    }
    return true;
}

export function intersects(a: Bounds, b: Bounds, dimensions: number): boolean {
    // Checks if boxes intersect (borders inclusively)
    for (let i = 0; i < dimensions; i++) {
        if (a[i * 2] > b[i * 2 + 1] || a[i * 2 + 1] < b[i * 2]) {
            return false;
        }
    }
    return true;
}

export function intersection(a: Bounds, b: Bounds, dimensions: number): Bounds {
    const intersection: Bounds = [];
    for (let i = 0; i < dimensions; i++) {
        intersection[i * 2] = Math.max(a[i * 2], b[i * 2]);
        intersection[i * 2 + 1] = Math.min(a[i * 2 + 1], b[i * 2 + 1]);
    }
    return intersection;
}

export function overlap(boundsList: Bounds[], withBounds: Bounds, dimensions: number): number {
    let sum = 0;
    for (const bounds of boundsList) {
        if (bounds !== withBounds) {
            sum += area(intersection(bounds, withBounds, dimensions), dimensions);
        }
    }
    return sum;
}

export function area(bounds: Bounds, dimensions: number): number {
    let area = 1;
    for (let i = 0; i < dimensions; i++) {
        area *= bounds[i * 2 + 1] - bounds[i * 2];
    }
    return area;
}

export function margin(bounds: Bounds, dimensions: number): number {
    let margin = 0;
    for (let i = 0; i < dimensions; i++) {
        margin += bounds[i * 2 + 1] - bounds[i * 2];
    }
    return (2 ** (dimensions - 1)) * margin;
}

export function combine(a: Bounds, b: Bounds, dimensions: number): Bounds {
    const bounds: Bounds = [];
    for (let i = 0; i < dimensions; i++) {
        bounds[i * 2] = Math.min(a[i * 2], b[i * 2]);
        bounds[i * 2 + 1] = Math.max(a[i * 2 + 1], b[i * 2 + 1]);
    }
    return bounds;
}

export function enclose(boundsList: Bounds[], dimensions: number): Bounds {
    const bounds: Bounds = [];
    for (let i = 0; i < dimensions; i++) {
        bounds[i * 2] = Math.min(...boundsList.map((bounds) => bounds[i * 2]));
        bounds[i * 2 + 1] = Math.max(...boundsList.map((bounds) => bounds[i * 2 + 1]));
    }
    return bounds;
}
