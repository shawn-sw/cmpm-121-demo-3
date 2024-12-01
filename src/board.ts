import leaflet from "leaflet";
import luck from "./luck.ts";

export default class Board {
  readonly tileWidth: number;
  readonly tileVisibilityRadius: number;
  readonly cacheSpawnProbability: number;

  private readonly knownCells: Map<string, Cell>;

  constructor(
    tileWidth: number,
    tileVisibilityRadius: number,
    cacheSpawnProbability: number,
  ) {
    this.tileWidth = tileWidth;
    this.tileVisibilityRadius = tileVisibilityRadius;
    this.cacheSpawnProbability = cacheSpawnProbability;
    this.knownCells = new Map();
  }

  private getCanonicalCell(cell: Cell): Cell {
    const { i, j } = cell;
    const key = [i, j].toString();
    if (!this.knownCells.has(key)) {
      this.knownCells.set(key, { i, j });
    }
    return this.knownCells.get(key)!;
  }

  getCellForPoint(point: leaflet.LatLng): Cell {
    const pixelOffsetLat = 120; // 向下偏移 20 像素
    const pixelOffsetLng = -60; // 向右偏移 30 像素

    // 将像素偏移量转换为地理单位
    const latOffset = (pixelOffsetLat / 256) * this.tileWidth;
    const lngOffset = (pixelOffsetLng / 256) * this.tileWidth;

    // 在计算索引时加入偏移量
    return this.getCanonicalCell({
      i: Math.floor((point.lat + latOffset) / this.tileWidth),
      j: Math.floor((point.lng + lngOffset) / this.tileWidth),
    });
  }

  getCellBounds(cell: Cell): leaflet.LatLngBounds {
    const pixelOffsetLat = 120; // 像素偏移量（向下）
    const pixelOffsetLng = -60; // 像素偏移量（向右）

    // 将像素偏移量转换为地理单位
    const latOffset = (pixelOffsetLat / 256) * this.tileWidth; // 纬度偏移量
    const lngOffset = (pixelOffsetLng / 256) * this.tileWidth; // 经度偏移量

    return leaflet.latLngBounds([
      [
        (cell.i * this.tileWidth) + latOffset, // 左上角纬度加偏移
        (cell.j * this.tileWidth) + lngOffset, // 左上角经度加偏移
      ],
      [
        ((cell.i + 1) * this.tileWidth) + latOffset, // 右下角纬度加偏移
        ((cell.j + 1) * this.tileWidth) + lngOffset, // 右下角经度加偏移
      ],
    ]);
  }

  getCellsNearPoint(point: leaflet.LatLng): Cell[] {
    const resultCells: Cell[] = [];
    const originCell = this.getCellForPoint(point);
    // iterate over neighborhood
    for (
      let i = -this.tileVisibilityRadius;
      i < this.tileVisibilityRadius;
      ++i
    ) {
      for (
        let j = -this.tileVisibilityRadius;
        j < this.tileVisibilityRadius;
        ++j
      ) {
        const lat = i + originCell.i;
        const lng = j + originCell.j;
        if (luck([lat, lng].toString()) < this.cacheSpawnProbability) {
          resultCells.push(this.getCanonicalCell({ i: lat, j: lng }));
        }
      }
    }
    return resultCells;
  }
}
