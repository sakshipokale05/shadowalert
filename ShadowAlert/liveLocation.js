// ================= LIVE LOCATION =================
const copyLinkBtn = document.getElementById("copyLinkBtn");
let watchId = null;
let currentUser = null;
const startBtn = document.getElementById("startShareBtn");
const stopBtn = document.getElementById("stopShareBtn");

startBtn.addEventListener("click", startLiveSharing);
stopBtn.addEventListener("click", stopLiveSharing);

copyLinkBtn.addEventListener("click", copyShareLink);
async function loadCurrentUser() {

    const {
        data: { user },
        error
    } = await supabaseClient.auth.getUser();

    if (error) {
        console.error(error);
        return;
    }

    currentUser = user;

    console.log("User ID:", currentUser.id);
    console.log("Email:", currentUser.email);
    console.log("User Object:", currentUser);
}
function startLiveSharing() {

    if (watchId !== null) {
        alert("Live location is already running.");


        return;
    }

    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        showLiveLocation,
        locationError,
        {
            enableHighAccuracy: true,
            maximumAge: 0
        }
    );

     // Show Copy Link button
    copyLinkBtn.style.display = "inline-block";
    alert("Live location started.");
}


function stopLiveSharing() {

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        copyLinkBtn.style.display = "none";
        alert("Live location stopped.");
    }
}
function copyShareLink() {

    const link =
        `${window.location.origin}/shadowalert_fixed/track.html?user=${currentUser.id}`;

    navigator.clipboard.writeText(link);

    alert("✅ Share link copied!");
}
async function showLiveLocation(position) {

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;

    console.log("Latitude :", latitude);
    console.log("Longitude:", longitude);

    const { data, error } = await supabaseClient
    .from("live_locations")
    .upsert(
        {
            user_id: currentUser.id,
            latitude: latitude,
            longitude: longitude,
            updated_at: new Date().toISOString()
        },
        {
            onConflict: "user_id"
        }
    );

    if (error) {
        console.error("Supabase Error:", error);
    } else {
        console.log("Location saved successfully!");
    }
}

function locationError(error) {

    alert("Unable to get location.");
    console.error(error);

}
loadCurrentUser();

