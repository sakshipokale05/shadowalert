// ================= MAP =================
const map = L.map("map").setView([18.5204, 73.8567], 13);

setTimeout(() => {
  map.invalidateSize();
}, 300);

// connect planner inputs
let srcLatLng = null;
let dstLatLng = null;

window.setSource = function(latlng) {
  srcLatLng = latlng;
};

window.setDestination = function(latlng) {
  dstLatLng = latlng;
};
// ================= CONSTANTS =================
const MAX_EXTRA_DISTANCE_RATIO = 2.0;
let selectedRouteIndex = null;
let feedbackPointMode = false;
let pendingFeedback = null;

// ================= SUPABASE =================
const supabaseClient = sb;

// ================= LOCAL CACHE =================
let userFeedbackDB = [];
let crimeData = [];
let routeLines = [];

// ================= TILES =================
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// ================= USER LOCATION =================
map.locate({ setView: true, maxZoom: 16 });

map.on("locationfound", e => {
  const radius = e.accuracy / 2;

  L.marker(e.latlng)
    .addTo(map)
    .bindPopup(`📍 You are here (±${Math.round(radius)} m)`)
    .openPopup();

  L.circle(e.latlng, {
    radius,
    color: "#136AEC",
    fillOpacity: 0.2
  }).addTo(map);
});

// ================= TIME SLOT =================
function getCurrentTimeSlot() {
  const h = new Date().getHours();
  if (h >= 6 && h < 18) return "day";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}
function getTimeSlot() {
  if (window.selectedTimeSlot && window.selectedTimeSlot !== "auto") {
    return window.selectedTimeSlot;
  }
  return getCurrentTimeSlot();
}
//const CURRENT_TIME_SLOT = "day";

// ================= HEATMAP =================
const heatLayer = L.heatLayer([], {
  radius: 25,
  blur: 15,
  maxZoom: 17
}).addTo(map);

// ================= ROUTING =================

/*
const routingControl = L.Routing.control({
  waypoints: [],
  routeWhileDragging: false,
  addWaypoints: false,
  showAlternatives: true,
  fitSelectedRoutes: true,

  router: L.Routing.osrmv1({
    serviceUrl: "https://router.project-osrm.org/route/v1",

    // 🔥 THIS IS THE IMPORTANT LINE
    profile: profileMap[window.selectedMode || "car"],

    alternatives: true,
    overview: "full",
    steps: false,
    geometries: "geojson"
  })
}).addTo(map);
*/
let routingControl;

const profileMap = {
  car: "driving",
  bike: "cycling",
  foot: "foot"
};

window.findRoutes = function () {

  if (!srcLatLng || !dstLatLng) {
    alert("Select both locations");
    return;
  }

  // Remove old route
  if (routingControl) {
    map.removeControl(routingControl);
  }

  // Create new routing
  routingControl = L.Routing.control({
    waypoints: [srcLatLng, dstLatLng],
    routeWhileDragging: false,
    addWaypoints: false,
    showAlternatives: true,
    fitSelectedRoutes: true,

    router: L.Routing.osrmv1({
      serviceUrl: "https://router.project-osrm.org/route/v1",
      profile: profileMap[window.selectedMode || "car"],
      alternatives: true,
      overview: "full",
      steps: false,
      geometries: "geojson"
    })
  }).addTo(map);

  // 🔥 IMPORTANT: reattach your logic
  routingControl.on("routesfound", e => {
    handleRoutes(e); // 👈 call your existing logic
  });

};
// ================= CLICK TO SET ROUTE / FEEDBACK =================
let startPoint = null;

map.on("click", e => {

  // --- FEEDBACK POINT ---
  if (feedbackPointMode) {
    saveFeedback({
      experience: pendingFeedback.experience,
      time_slot: getTimeSlot(),
      lat: e.latlng.lat,
      lng: e.latlng.lng
    });

    L.circleMarker(e.latlng, {
      radius: 8,
      color: pendingFeedback.experience === "risky" ? "red" : "orange",
      fillOpacity: 0.9
    }).addTo(map).bindPopup("User reported unsafe spot");

    feedbackPointMode = false;
    pendingFeedback = null;
    alert("Feedback saved. Thank you!");
    return;
  }

  // // --- ROUTING ---
  // if (!startPoint) {
  //   startPoint = e.latlng;
  //   L.marker(startPoint).addTo(map).bindPopup("🚩 Start").openPopup();
  // } else {
  //   routingControl.setWaypoints([startPoint, e.latlng]);
  //   startPoint = null;
  // }
});

// ================= LOAD CRIME DATA =================
fetch("data/crime_data_processed.json")
  .then(res => res.json())
  .then(data => {
    crimeData = data;
    updateHeatmapByTime();
  })
  .catch(err => console.error("Crime data load failed", err));
// ================= LOAD FEEDBACK ON START =================
window.onload = () => {
  loadFeedbackFromDB();
  initRealtime();   
};
// ================= UPDATE HEATMAP =================
function updateHeatmapByTime() {
  const points = [];
  if (!document.getElementById("toggleHeat")?.classList.contains("on")) {
    heatLayer.setLatLngs([]);
    return;
  }
  // ---- Crime data ----
  crimeData.forEach(c => {
    let relevance =
      c.time_slot === getTimeSlot() ? 1 :
      c.time_slot === "evening" && getTimeSlot() === "night" ? 0.4 : 0.05;

    const weight = c.severity_weight * c.time_weight * relevance * 3;
    if (weight > 0.2) {
      points.push([Number(c.lat), Number(c.lng), weight]);
    }
  });

  // ---- User feedback ----
  userFeedbackDB.forEach(fb => {
    if (fb.experience === "safe") return;
    if (fb.lat == null || fb.lng == null) return;

    const weight = fb.experience === "risky" ? 1.4 : 0.6;

    points.push([
      Number(fb.lat),
      Number(fb.lng),
      weight
    ]);
  });

  heatLayer.setLatLngs(points);
  heatLayer.redraw();
}

// ================= ROUTE ANALYSIS =================
function handleRoutes(e) {

  // Clear old routes
  routeLines.forEach(r => map.removeLayer(r.line));
  routeLines = [];

  const routeList = document.getElementById("routeList");
  if (routeList) routeList.innerHTML = "";

  let routes = e.routes.slice(0, 3);
  let bestIndex = -1;
  let bestScore = -1;

  routes.forEach((route, index) => {

    const danger = calculateDanger(route.coordinates);
    const lengthKm = route.summary.totalDistance / 1000;
    const safetyScore = Math.round(100 / (1 + danger / lengthKm));

    if (safetyScore > bestScore) {
      bestScore = safetyScore;
      bestIndex = index;
    }

    // Draw route
    const line = L.polyline(route.coordinates.map(p => [p.lat, p.lng]), {
      color: "gray",
      weight: 4,
      opacity: 0.4
    }).addTo(map);

    routeLines.push({ line, coords: route.coordinates, score: safetyScore });

    // Create UI list
    const li = document.createElement("li");
    li.style.padding = "10px";
    li.style.marginBottom = "8px";
    li.style.borderRadius = "8px";
    li.style.cursor = "pointer";
    li.style.background =
      safetyScore > 70 ? "#dcfce7" :
      safetyScore > 40 ? "#fff7ed" : "#fee2e2";

    li.innerHTML = `
      <strong>Route ${index + 1}</strong><br>
      Safety: ${safetyScore}/100<br>
      Distance: ${lengthKm.toFixed(2)} km
    `;

    li.onclick = () => highlightRoute(index);

    if (routeList) routeList.appendChild(li);
  });

  highlightRoute(bestIndex);
}
// ================= DANGER CALCULATION =================
function calculateDanger(routeCoords) {
  let danger = 0;

  // ===== CRIME INFLUENCE (STABLE VERSION) =====
  crimeData.forEach(crime => {
    let minDist = Infinity;

    routeCoords.forEach(p => {
      const d = map.distance([p.lat, p.lng], [crime.lat, crime.lng]);
      if (d < minDist) minDist = d;
    });

    const CRIME_RADIUS = 100;

    if (minDist < CRIME_RADIUS) {
      const timeFactor =
        crime.time_slot === getTimeSlot() ? 1.5 :
        crime.time_slot === "evening" && getTimeSlot() === "night" ? 1.1 :
        0.3;

      const distanceFactor = Math.sqrt(1 - minDist / CRIME_RADIUS);

      let crowdFactor = 1.0;

      if (getTimeSlot() === "day" && !["Robbery", "Assault"].includes(crime.crime_type)) {
        crowdFactor = 0.2;
      } else if (getTimeSlot() === "evening" && !["Robbery", "Assault"].includes(crime.crime_type)) {
        crowdFactor = 0.4;
      }

      danger +=
        crime.severity_weight *
        crime.time_weight *
        timeFactor *
        distanceFactor *
        crowdFactor;
    }
  });

  // ===== USER FEEDBACK INFLUENCE (CONTROLLED) =====
  userFeedbackDB.forEach(fb => {
    if (fb.lat === null || fb.lng === null) return;

    let minDist = Infinity;

    routeCoords.forEach(p => {
      const d = map.distance([p.lat, p.lng], [fb.lat, fb.lng]);
      if (d < minDist) minDist = d;
    });

    const FEEDBACK_RADIUS = 120;

    if (minDist < FEEDBACK_RADIUS) {
      const base =
        fb.experience === "risky" ? 0.6 :
        fb.experience === "moderate" ? 0.3 : 0;

      const distanceFactor = 1 - minDist / FEEDBACK_RADIUS;
      danger += base * distanceFactor;
    }
  });
  const useCrowd = document.getElementById("toggleCrowd")?.classList.contains("on") ?? true;
  const prioritizeSafety = document.getElementById("toggleSafety")?.classList.contains("on") ?? true;

  if (!prioritizeSafety) {
    danger *= 0.6; // reduce impact
  }
  return danger;
}

// ================= HIGHLIGHT ROUTE =================
function highlightRoute(index) {
  selectedRouteIndex = index;

  routeLines.forEach((r, i) => {
    map.removeLayer(r.line);
    const color = r.score < 40 ? "red" : r.score < 70 ? "orange" : "green";

    r.line = L.polyline(r.coords.map(p => [p.lat, p.lng]), {
      color: i === index ? color : "gray",
      weight: i === index ? 7 : 4,
      opacity: i === index ? 1 : 0.3
    }).addTo(map);
  });
}

// ================= FINISH JOURNEY =================
/*document.getElementById("finishBtn").onclick = () => {

  if (selectedRouteIndex === null) {
    alert("Select a route first");
    return;
  }

  const exp = prompt("Journey experience?\n1 = Safe\n2 = Moderate\n3 = Risky");
  if (!exp) return;

  const experience =
    exp === "1" ? "safe" :
    exp === "2" ? "moderate" : "risky";

  if (experience === "safe") {
    alert("Thanks! Safe feedback recorded.");
    return;
  }

  feedbackPointMode = true;
  pendingFeedback = { experience };
  alert("Click on map to mark the unsafe location");
};
*/

async function submitFeedback(experience) {

    closeFeedbackModal();

    if (experience === "safe") {

        alert("Thanks! Safe feedback recorded.");

        return;

    }

    feedbackPointMode = true;

    pendingFeedback = {
        experience: experience
    };

    alert("Click on the map to mark the unsafe location.");

}

// ================= SUPABASE FUNCTIONS =================
async function saveFeedback(data) {
  const feedback = {
    experience: data.experience,
    time_slot: data.time_slot,
    lat: data.lat,
    lng: data.lng
  };

  const { error } = await supabaseClient
    .from("user_feedback")
    .insert([feedback]);

  if (error) {
    console.error(error);
    alert("Failed to save feedback");
    return;
  }

  await loadFeedbackFromDB(); // updates heatmap

  // 🔥 FORCE route recomputation
  const wps = routingControl.getWaypoints();
  if (wps.length === 2 && wps[0].latLng && wps[1].latLng) {
    routingControl.setWaypoints([
      wps[0].latLng,
      wps[1].latLng
    ]);
  }
}

async function loadFeedbackFromDB() {
  const { data, error } = await supabaseClient
    .from("user_feedback")
    .select("*");

  if (error) {
    console.error(error);
    return;
  }
  userFeedbackDB = data || [];
  updateHeatmapByTime();

}
let currentUserLocation = null;

// ================= REAL-TIME LOCATION TRACKING =================
navigator.geolocation.watchPosition(
  position => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    currentUserLocation = { lat, lng };

    checkNearbyDanger(); // 🔥 trigger alert check
  },
  err => console.warn(err),
  {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000
  }
);

// ================= CHECK NEARBY DANGER =================
let lastAlertTime = 0;

function checkNearbyDanger() {
  if (!currentUserLocation) return;

  const now = Date.now();

  if (now - lastAlertTime < 10000) return;

  // ===== CHECK USER FEEDBACK =====
  for (let fb of userFeedbackDB) {
    if (!fb.lat || !fb.lng) continue;

    if (
      fb.time_slot !== getTimeSlot() &&
      !(fb.time_slot === "evening" && getTimeSlot() === "night")
    ) continue;

    let isDangerNearRoute = false;

    routeLines.forEach(route => {
      route.coords.forEach(p => {
        const d = map.distance([p.lat, p.lng], [fb.lat, fb.lng]);
        if (d < 150) {
          isDangerNearRoute = true;
        }
      });
    });

    if (isDangerNearRoute) {
      showNotification("⚠️ Unsafe area on your route!");
      lastAlertTime = now;
      return;
    }
  }
  

  // ===== CHECK CRIME DATA =====
  for (let crime of crimeData) {
    const d = map.distance(
      [currentUserLocation.lat, currentUserLocation.lng],
      [crime.lat, crime.lng]
    );

    if (d < 200) {
      showNotification("🚨 High crime area nearby!");
      lastAlertTime = now;
      return;
    }
  }
}
// Supabase REAL-TIME listener

function initRealtime() {
  supabaseClient
    .channel("realtime-feedback")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_feedback"
      },
      payload => {

        // Avoid duplicate
        if (!userFeedbackDB.some(f => f.id === payload.new.id)) {
          userFeedbackDB.push(payload.new);
        }

        updateHeatmapByTime();

        // Alert
        checkNearbyDanger();

        // Recalculate route
        if (routingControl) {
          const wps = routingControl.getWaypoints();
          if (wps.length === 2 && wps[0].latLng && wps[1].latLng) {
            routingControl.setWaypoints([wps[0].latLng, wps[1].latLng]);
          }
        }
      }
    )
    .subscribe(status => {
      console.log("Realtime status:", status);
    });
}
function showNotification(msg) {
  const div = document.createElement("div");
  div.innerText = msg;

  div.style.position = "absolute";
  div.style.top = "20px";
  div.style.right = "20px";
  div.style.background = "red";
  div.style.color = "white";
  div.style.padding = "12px";
  div.style.borderRadius = "8px";
  div.style.zIndex = 9999;

  document.body.appendChild(div);

  setTimeout(() => div.remove(), 3000);
}

