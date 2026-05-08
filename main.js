const costData = {
  walls: {
    "2x4": 33,
    "2x6": 35.8
  },
  wallSurcharge: 1000,
  finishing: {
    "Minimal Budget": 66,
    "Modest": 82,
    "Average": 100,
    "Premium": 150,
    "Designer": 200
  },
  labor: {
    "DIY": 0,
    "DIY & Sub": 30,
    "General": 60
  },
  permit: {
    "PRADU": 500,
    "ADU": 6000
  },
  approval: {
    "PRADU": "Virtually Immediate",
    "ADU": "Several Months"
  },
  foundation: {
    "Low": 12,
    "Probable": 16,
    "Median": 20,
    "Higher": 25,
    "Unusual Conditions": 40
  },
  foundationMinimum: 9900,
  slab: {
    "Slab": 0,
    "Floor Joist": 8.50
  },
  fireResistant: 8.7
};

const WAREHOUSE_LOCATION = {
  lat: 31.9678,
  lng: -110.2945,
  address: "Our Warehouse, Benson, AZ 85602"
};

const TRAILER_RATES = {
  RATE_40:       { maxLinearFeet: 42,  rate: 2.22, label: "One 40' trailer",   trailerCount: 1, minChargePerTrailer: 1500 },
  RATE_53:       { maxLinearFeet: 55,  rate: 3.60, label: "One 53' trailer",   trailerCount: 1, minChargePerTrailer: 1500 },
  RATE_84:       { maxLinearFeet: 84,  rate: 4.40, label: "Two 40' trailers",  trailerCount: 2, minChargePerTrailer: 1500 },
  RATE_126:      { maxLinearFeet: 126, rate: 6.80, label: "Three 40' trailers", trailerCount: 3, minChargePerTrailer: 1500 },
  RATE_127_PLUS: { maxLinearFeet: 999, rate: 9.00, label: "Four 40' trailers",  trailerCount: 4, minChargePerTrailer: 1500 }
};

let map;
let directionsRenderer;
let directionsService;
let autocomplete;
let destinationPlace = null;
let warehouseMarker = null;
let lastDistanceMiles = 0;

function getLinearFeet(sqft) {
  if (sqft < 550)  return 20;
  if (sqft < 750)  return 40;
  if (sqft < 1050) return 52;
  if (sqft < 1500) return 80;
  if (sqft < 1850) return 120;
  return 160;
}

function getTrailerConfig(linearFeet) {
  if (linearFeet <= 42)  return TRAILER_RATES.RATE_40;
  if (linearFeet <= 55)  return TRAILER_RATES.RATE_53;
  if (linearFeet <= 84)  return TRAILER_RATES.RATE_84;
  if (linearFeet <= 126) return TRAILER_RATES.RATE_126;
  return TRAILER_RATES.RATE_127_PLUS;
}

function updatePermit() {
  const type = document.getElementById("permitType").value;
  document.getElementById("permitCost").value = `$${costData.permit[type].toLocaleString()}`;

  const approvalField = document.getElementById("approvalTime");
  approvalField.value = costData.approval[type];
  approvalField.className =
    approvalField.value === "Virtually Immediate" ? "status green" : "status red";

  calculate();
}

function calculate() {
  const sqft = parseFloat(document.getElementById("sqft").value) || 0;

  const foundationRate = costData.foundation[document.getElementById("foundationCondition").value] || 0;
  const foundation = Math.max(sqft * foundationRate, costData.foundationMinimum);
  const slab = sqft * (costData.slab[document.getElementById("slabType").value] || 0);
  const wallCost = sqft * costData.walls[document.getElementById("wallType").value] + costData.wallSurcharge;
  const finishCost = sqft * costData.finishing[document.getElementById("finishType").value];
  const laborCost = sqft * costData.labor[document.getElementById("laborType").value];
  const permitCost = parseInt(document.getElementById("permitCost").value.replace(/\D/g, '')) || 0;
  const fireResistant = document.getElementById("fireResistant").value === "Yes"
    ? sqft * costData.fireResistant
    : 0;

  const subtotalWithoutLabor = foundation + slab + wallCost + finishCost + permitCost + fireResistant;
  const totalBeforeEconomy = subtotalWithoutLabor + laborCost;

  const economyPercent = parseFloat(document.getElementById("economyAdjustment").value) || 0;
  document.getElementById("economyValue").textContent = `${economyPercent}%`;
  const total = totalBeforeEconomy * (1 + economyPercent / 100);

  const fmt = (a) =>
    `$${a.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  document.getElementById("foundationCost").value = fmt(foundation);
  document.getElementById("slabCost").value = fmt(slab);
  document.getElementById("wallCost").value = fmt(wallCost);
  document.getElementById("finishCost").value = fmt(finishCost);
  document.getElementById("laborCost").value = fmt(laborCost);
  document.getElementById("fireCost").value = fmt(fireResistant);
  document.getElementById("totalWithoutLabor").value = fmt(subtotalWithoutLabor);
  document.getElementById("totalCost").value = fmt(total);
  document.getElementById("totalTop").value = fmt(total);

  const downPct = parseFloat(document.getElementById("downPaymentPercent").value) || 0;
  const downAmount = total * (downPct / 100);
  const financed = total - downAmount;
  const years = parseInt(document.getElementById("loanTerm").value) || 0;
  const interest = parseFloat(document.getElementById("interestRate").value) || 0;

  document.getElementById("downPaymentAmount").value = fmt(downAmount);
  document.getElementById("financedAmount").value = fmt(financed);
  document.getElementById("monthlyPayment").value = fmt(calculateMonthlyPayment(financed, interest, years));

  updateShipping();
}

function updateShipping() {
  const sqft = parseFloat(document.getElementById("sqft").value) || 0;
  const linearFeet = getLinearFeet(sqft);
  const trailerConfig = getTrailerConfig(linearFeet);

  const linearFeetEl = document.getElementById("linearFeet");
  const trailerSizeEl = document.getElementById("trailerSize");
  const distanceEl = document.getElementById("distanceMiles");
  const shippingEl = document.getElementById("shippingCost");
  const minNoteEl = document.getElementById("minimumNote");
  if (!linearFeetEl) return;

  linearFeetEl.value = `${linearFeet} ft`;
  trailerSizeEl.value = trailerConfig.label;

  const fmt = (a) =>
    `$${a.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (lastDistanceMiles > 0) {
    const baseCost = lastDistanceMiles * trailerConfig.rate;
    const minCharge = trailerConfig.trailerCount * trailerConfig.minChargePerTrailer;
    const finalCost = Math.max(minCharge, baseCost);

    distanceEl.value = `${lastDistanceMiles.toFixed(1)} miles`;
    shippingEl.value = fmt(finalCost);
    minNoteEl.classList.toggle("hidden", baseCost >= minCharge);
  } else {
    distanceEl.value = "";
    shippingEl.value = "";
    minNoteEl.classList.add("hidden");
  }
}

function calculateMonthlyPayment(principal, annualRate, years) {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return r === 0
    ? principal / n
    : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function showMapError(msg) {
  const mapDiv = document.getElementById("shipMap");
  if (!mapDiv) return;
  mapDiv.innerHTML = `<div style="padding:16px;color:#b91c1c;font-size:13px;line-height:1.5;">
    <b>Map failed to load.</b><br>${msg}<br><br>
    Check the browser console (F12) for details. Common causes:
    <ul style="margin:6px 0 0 18px;">
      <li>API key restricted to a different domain</li>
      <li>Billing not enabled on the Google Cloud project</li>
      <li>Maps JavaScript API / Places API / Directions API not enabled</li>
      <li>Page opened via <code>file://</code> instead of <code>http(s)://</code></li>
    </ul>
  </div>`;
}

async function initMap() {
  try {
    const mapDiv = document.getElementById("shipMap");
    if (!mapDiv) return;

    if (!window.google || !google.maps || !google.maps.importLibrary) {
      showMapError("Google Maps script did not load.");
      return;
    }

    const { Map } = await google.maps.importLibrary("maps");
    const { DirectionsRenderer, DirectionsService } = await google.maps.importLibrary("routes");
    const { Autocomplete } = await google.maps.importLibrary("places");

    map = new Map(mapDiv, {
      center: { lat: WAREHOUSE_LOCATION.lat, lng: WAREHOUSE_LOCATION.lng },
      zoom: 6
    });

    directionsService = new DirectionsService();
    directionsRenderer = new DirectionsRenderer({
      map: map,
      suppressMarkers: false,
      polylineOptions: { strokeColor: "#3e7a32", strokeWeight: 5 }
    });

    warehouseMarker = new google.maps.Marker({
      position: { lat: WAREHOUSE_LOCATION.lat, lng: WAREHOUSE_LOCATION.lng },
      map: map,
      title: "FrameUpNow Warehouse — Benson, AZ"
    });

    const inputEl = document.getElementById("deliveryAddress");
    if (inputEl) {
      autocomplete = new Autocomplete(inputEl, {
        fields: ["address_components", "geometry", "formatted_address", "types"],
        types: ["(regions)"],
        componentRestrictions: { country: "us" }
      });

      autocomplete.addListener("place_changed", () => {
        destinationPlace = autocomplete.getPlace();
        drawRoute();
      });
    }

  } catch (err) {
    console.error("Map init failed:", err);
    showMapError(String(err && err.message ? err.message : err));
  }
}

// Defined at module scope so Maps can call it on auth/key failure
window.gm_authFailure = function () {
  showMapError("Authentication failed — check the API key, billing is enabled, and the referrer matches the key restrictions.");
};

function drawRoute() {
  if (!destinationPlace || !destinationPlace.geometry || !directionsService) return;

  directionsService.route(
    {
      origin: { lat: WAREHOUSE_LOCATION.lat, lng: WAREHOUSE_LOCATION.lng },
      destination: destinationPlace.geometry.location,
      travelMode: google.maps.TravelMode.DRIVING
    },
    (result, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);
        const meters = result.routes[0]?.legs[0]?.distance?.value || 0;
        lastDistanceMiles = meters / 1609.344;
        updateShipping();
      }
    }
  );
}

window.addEventListener('DOMContentLoaded', () => {
  updatePermit();
  calculate();
  initMap();
});
