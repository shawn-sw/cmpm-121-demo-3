// =======================
// Import Libraries and Styles
// =======================
// This section imports the necessary third-party libraries, styles, and project modules.
// Leaflet is used for map interactions.
// Board and Geocache are used to manage the grid and cache points on the map.


import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";

import Board from "./board.ts";
import Geocache from "./geocache.ts";

import "./style.css";

// =======================
// Map and Game Parameter Settings
// =======================
// Initialize parameters such as the map center, zoom level, and neighborhood size.
// Define global variables and the event bus for game-related functionalities.


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
// Create Game Board and Map
// =======================
// Set up the game board instance to manage cached grid cells.
// Initialize the Leaflet map and player marker.

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
// Player Coins and Status Panel
// =======================
// Logic to manage the player's coin status, including updating the inventory panel.


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
    : "0 coins";
}
updateCoinDisplay();

// =======================
// Cache Point Management
// =======================
// Responsible for the generation, display, and interaction logic of cache points.

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
// Player Movement and Auto-Positioning
// =======================
// Includes the functional logic for both manual and automatic player movement.


function updatePlayerPosition(direction: Cell): void {
  if (autoTrackingEnabled) return; // 自动定位时不手动移动
  const currentPos = playerMarker.getLatLng();
  const newPos = {
    lat: currentPos.lat + TILE_DEGREES * direction.i,
    lng: currentPos.lng + TILE_DEGREES * direction.j,
  };

  // Update Player Marker Position
  playerMarker.setLatLng(newPos);

  // Add Polyline Drawing Logic
  extendPolyline(newPos);

  // Trigger Player Movement Event
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
// Data Persistence Logic
// =======================
// Save and restore player data, including cache points, coin status, and other game states.


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
// Event Listeners
// =======================
// Handle events related to player movement and positioning.


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
// Control Panel Functions
// =======================
// Define control commands (North, South, West, East, Auto-Positioning, Reset Progress) that players can interact with via buttons.


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
// Draw Polyline Path
// =======================
// Manage the display of polyline paths on the map, including creating new segments and extending existing paths.


const polylineLayer = leaflet.layerGroup().addTo(map);

function newPolyline(point: leaflet.LatLng) {
  polylinePts.unshift([point]); // 在路径列表顶部添加新路径
  drawPolyline(polylinePts[0]); // 立即绘制新路径
}

function drawPolyline(points: leaflet.LatLng[] = polylinePts[0]) {
  leaflet.polyline(points, POLYLINE_OPTIONS).addTo(polylineLayer);
}

// =======================
// Cache Point Display and Cleanup
// =======================
// Display cache points near the player and clean up outdated cache points when the player moves.


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
// Data Persistence Utility Functions
// =======================
// Used to manage save, retrieve, and delete operations for data in local storage.


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
// Game Progress Reset
// =======================
// Provides functionality to reset player data and clear the map.


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
// Page Load and Unload Events
// =======================
// Restore player data on page load and save data on unload.


globalThis.addEventListener("beforeunload", storePlayerData);
globalThis.addEventListener("load", loadGameState);

// =======================
// Debug Information (Optional)
// =======================
// Debug output displayed in the console to verify data loading and cache point generation logic.


function transferCoins(source: Coin[], stock: Coin[]): [Coin[], Coin[]] {
  if (source.length === 0) return [source, stock]; // 如果没有硬币可转移
  stock.push(source.shift()!); // 从 source 转移一个硬币到 stock
  return [source, stock];
}
