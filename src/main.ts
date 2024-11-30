// =======================
// 引入库和样式
// =======================
// 这里导入所需的第三方库、样式和项目模块。
// Leaflet 用于地图交互。
// Board 和 Geocache 用于管理地图中的格子和缓存点。

import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";
import Board from "./board.ts";
import Geocache from "./geocache.ts";
import "./style.css";

// =======================
// 地图和游戏参数设置
// =======================
// 初始化地图中心、缩放等级、邻域大小等参数。
// 定义游戏相关的全局变量和事件总线。

const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const POLYLINE_OPTIONS = { color: "yellow" };

let autoTrackingEnabled: boolean = false;
let collectedCoins: Coin[] = [];
let momento: { [key: string]: string } = {};
let polylinePts: leaflet.LatLng[][] = [];
const bus = new EventTarget();

// =======================
// 创建游戏板和地图
// =======================
// 设置游戏板实例，用于管理缓存格子。
// 初始化 Leaflet 地图和玩家标记。

const gameBoard = new Board(
  TILE_DEGREES,
  NEIGHBORHOOD_SIZE,
  CACHE_SPAWN_PROBABILITY,
);

const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("You!");
playerMarker.addTo(map);

// =======================
// 玩家硬币和状态面板
// =======================
// 管理玩家硬币状态的逻辑，包括更新库存面板。

const statusPanel = document.querySelector<HTMLDivElement>("#inventory-total")!;
function updateCoinDisplay(): void {
  const inventory = document.querySelector<HTMLUListElement>(
    "#inventory-items",
  )!;
  inventory.innerHTML = collectedCoins.map((coin) =>
    `<li>${coin.i}:${coin.j}#${coin.serial}</li>`
  ).join("");
  statusPanel.innerHTML = collectedCoins.length > 0
    ? `${collectedCoins.length} coins accumulated`
    : "No coins yet...";
}
updateCoinDisplay();

// =======================
// 缓存点管理
// =======================
// 负责缓存点的生成、显示以及交互逻辑。

const visibleCaches: Geocache[] = [];
const cacheLayer = leaflet.layerGroup().addTo(map);

function generateCacheItem(cache: Geocache): void {
  visibleCaches.push(cache);
  const bounds = gameBoard.getCellBounds({ i: cache.i, j: cache.j });
  const rect = leaflet.rectangle(bounds);
  cacheLayer.addLayer(rect);

  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cache Index: ${cache.i}, ${cache.j}. 
      It has <span id="value"></span> coins.</div>
      <ul id="cache-inventory"></ul>
      <button id="collect">collect</button>
      <button id="deposit">deposit</button>`;
    updateUI();

    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => {
        [cache.stock, collectedCoins] = transferCoins(
          cache.stock,
          collectedCoins,
        );
        updateUI();
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        [collectedCoins, cache.stock] = transferCoins(
          collectedCoins,
          cache.stock,
        );
        updateUI();
      },
    );

    return popupDiv;

    function updateUI(): void {
      updateCoinDisplay();
      popupDiv.querySelector<HTMLSpanElement>("#value")!.textContent = cache
        .stock.length.toString();
      popupDiv.querySelector<HTMLUListElement>("#cache-inventory")!.innerHTML =
        cache.stock.map((coin) => `<li>${coin.i}:${coin.j}#${coin.serial}</li>`)
          .join("");
    }
  });
}

// =======================
// 玩家移动和自动定位
// =======================
// 包括玩家手动和自动移动的功能逻辑。

function updatePlayerPosition(direction: Cell): void {
  if (autoTrackingEnabled) return; // 自动定位时不手动移动
  const currentPos = playerMarker.getLatLng();
  const newPos = {
    lat: currentPos.lat + TILE_DEGREES * direction.i,
    lng: currentPos.lng + TILE_DEGREES * direction.j,
  };

  // 更新玩家标记位置
  playerMarker.setLatLng(newPos);

  // 添加折线绘制逻辑
  extendPolyline(newPos);

  // 触发玩家移动事件
  bus.dispatchEvent(new Event("player-moved"));
}

function extendPolyline(newPoint: leaflet.LatLng) {
  if (polylinePts.length === 0) {
    // 如果没有现有路径，创建新路径
    newPolyline(newPoint);
  } else {
    // 向现有路径添加新点
    polylinePts[0].push(newPoint);
    drawPolyline(polylinePts[0]); // 更新路径显示
  }
}

// 自动移动逻辑
function toggleAutoTracking(enable: boolean): void {
  if (enable) {
    map.locate({ setView: true, watch: true, maxZoom: GAMEPLAY_ZOOM_LEVEL });
    document.getElementById("notification")!.textContent = "autolocation on";
  } else {
    map.stopLocate();
    document.getElementById("notification")!.textContent = "autolocation off";
  }
}

// =======================
// 数据持久化逻辑
// =======================
// 保存和恢复玩家数据，包括缓存点、硬币状态等。

function storePlayerData() {
  saveToLocalStorage("collectedCoins", collectedCoins);
  clearStaleCaches();
  saveToLocalStorage("momento", momento);
  saveToLocalStorage("autolocate", autoTrackingEnabled.toString());
  saveToLocalStorage("playerPosition", playerMarker.getLatLng());
  saveToLocalStorage("polyline", polylinePts);
}

function loadGameState() {
  collectedCoins = loadFromLocalStorage("collectedCoins") ?? [];
  updateCoinDisplay();
  momento = loadFromLocalStorage("momento") ?? {};
  autoTrackingEnabled = loadFromLocalStorage("autolocate") ?? false;
  bus.dispatchEvent(new Event("locate-toggled"));
  polylinePts = loadFromLocalStorage("polyline") ?? [];
  for (const pts of polylinePts) drawPolyline(pts);
  playerMarker.setLatLng(
    loadFromLocalStorage("playerPosition") ?? OAKES_CLASSROOM,
  );
  newPolyline(playerMarker.getLatLng());
  bus.dispatchEvent(new Event("player-moved"));
}

// =======================
// 事件监听器
// =======================
// 处理与玩家移动和定位相关的事件。

bus.addEventListener("player-moved", () => {
  clearStaleCaches();
  displayNearbyCaches();
  map.setView(playerMarker.getLatLng(), GAMEPLAY_ZOOM_LEVEL, { animate: true });
});
bus.addEventListener(
  "locate-toggled",
  () => toggleAutoTracking(autoTrackingEnabled),
);
// =======================
// 控制面板功能
// =======================
// 定义玩家可通过按钮交互的控制命令（北、南、西、东、自动定位、重置进度）。

interface Cmd {
  execute(): void;
}

const controlPanel: { [key: string]: Cmd } = {
  north: {
    execute() {
      updatePlayerPosition({ i: 1, j: 0 });
    },
  },
  east: {
    execute() {
      updatePlayerPosition({ i: 0, j: 1 });
    },
  },
  south: {
    execute() {
      updatePlayerPosition({ i: -1, j: 0 });
    },
  },
  west: {
    execute() {
      updatePlayerPosition({ i: 0, j: -1 });
    },
  },
  sensor: {
    execute() {
      autoTrackingEnabled = !autoTrackingEnabled;
      bus.dispatchEvent(new Event("locate-toggled"));
      bus.dispatchEvent(new Event("player-moved"));
    },
  },
  reset: {
    execute() {
      const confirmation = prompt(
        "Do you really want to reset progress? [y/n]",
      );
      if (confirmation === "y") {
        resetGameState();
      }
    },
  },
};

// 添加事件监听器到控制按钮
for (const button in controlPanel) {
  const buttonElement = document.querySelector<HTMLButtonElement>(
    `#${button}`,
  )!;
  buttonElement.addEventListener("click", controlPanel[button].execute);
}

// =======================
// 绘制折线路径
// =======================
// 管理地图上的折线路径显示，包括创建新折线段和扩展现有路径。

const polylineLayer = leaflet.layerGroup().addTo(map);

function newPolyline(point: leaflet.LatLng) {
  polylinePts.unshift([point]); // 在路径列表顶部添加新路径
  drawPolyline(polylinePts[0]); // 立即绘制新路径
}

function drawPolyline(points: leaflet.LatLng[] = polylinePts[0]) {
  leaflet.polyline(points, POLYLINE_OPTIONS).addTo(polylineLayer);
}

// =======================
// 缓存点显示与清理
// =======================
// 显示玩家附近的缓存点，并在玩家移动时清理过时的缓存点。

function momentoKey(cell: Cell): string {
  return [cell.i, cell.j].toString();
}

function displayNearbyCaches() {
  gameBoard.getCellsNearPoint(playerMarker.getLatLng()).forEach((cell) => {
    const cache = new Geocache(cell);
    if (momento[momentoKey(cell)] !== undefined) {
      cache.fromMomento(momento[momentoKey(cell)]);
    }
    generateCacheItem(cache);
  });
}

function clearStaleCaches() {
  visibleCaches.forEach((cache) => {
    momento[momentoKey({ i: cache.i, j: cache.j })] = cache.toMomento();
  });
  cacheLayer.clearLayers();
  visibleCaches.length = 0;
}

// =======================
// 数据持久化工具函数
// =======================
// 用于管理数据在本地存储中的保存、获取和删除操作。

// 保存数据到本地存储
function saveToLocalStorage(key: string, data: string | number | object) {
  localStorage.setItem(`cmpm121d3_${key}`, JSON.stringify(data));
}

function loadFromLocalStorage<T>(key: string): T | null {
  const item = localStorage.getItem(`cmpm121d3_${key}`);
  return item ? (JSON.parse(item) as T) : null;
}

// 从本地存储删除数据
function deleteFromLocalStorage(key: string) {
  localStorage.removeItem(`cmpm121d3_${key}`);
}

// =======================
// 游戏进度重置
// =======================
// 提供重置玩家数据和清理地图的功能。

function resetGameState() {
  deleteFromLocalStorage("collectedCoins");
  deleteFromLocalStorage("momento");
  deleteFromLocalStorage("autolocate");
  deleteFromLocalStorage("playerPosition");
  deleteFromLocalStorage("polyline");

  cacheLayer.clearLayers();
  polylineLayer.clearLayers();

  playerMarker.setLatLng(OAKES_CLASSROOM);
  collectedCoins = [];
  momento = {};
  autoTrackingEnabled = false;
  polylinePts = [];

  bus.dispatchEvent(new Event("locate-toggled"));
  displayNearbyCaches();
  updateCoinDisplay();
  map.setView(OAKES_CLASSROOM, GAMEPLAY_ZOOM_LEVEL, { animate: true });
}

// =======================
// 页面加载和卸载事件
// =======================
// 在页面加载时恢复玩家数据，卸载时保存数据。

globalThis.addEventListener("beforeunload", storePlayerData);
globalThis.addEventListener("load", loadGameState);

// =======================
// 调试信息（可选）
// =======================
// 显示在控制台上的调试输出，用于验证数据加载和缓存点生成逻辑。

function transferCoins(source: Coin[], stock: Coin[]): [Coin[], Coin[]] {
  if (source.length === 0) return [source, stock]; // 如果没有硬币可转移
  stock.push(source.shift()!); // 从 source 转移一个硬币到 stock
  return [source, stock];
}
