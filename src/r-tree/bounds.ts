export type Bounds = number[];

export interface Bounded {
    bounds: Bounds;
}

export function overlaps(a: Bounds, b: Bounds, dimensions: number): boolean {
    // Checks if bounds overlap (inclusively borders)
    for (let i = 0; i < dimensions; i++) {
        if (a[i * 2] > b[i * 2 + 1] || a[i * 2 + 1] < b[i * 2]) {
            return false;
        }
    }
    return true;
}

export function area(bounds: Bounds, dimensions: number): number {
    let area = 1;
    for (let i = 0; i < dimensions; i++) {
        area *= bounds[i * 2 + 1] - bounds[i * 2];
    }
    return area;
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
