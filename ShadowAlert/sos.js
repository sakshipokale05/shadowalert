// ===== SOS FEATURE =====

// 📍 Get current location
function getLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos.coords),
      err => reject(err)
    );
  });
}

// ☁️ Fetch contacts from Supabase (declared ONCE)
async function getContacts() {
  const { data, error } = await window.sb
    .from("emergency_contacts")
    .select("*");

  console.log("Contacts:", data);
  console.log("Error:", error);

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}
// ✉️ Create SOS message
function createMessage(lat, lng) {
  return `🚨 EMERGENCY! I need help immediately.\nMy location: https://maps.google.com/?q=${lat},${lng}\nSent via ShadowAlert.`;
}

// 📱 Open WhatsApp
function openWhatsApp(phone, message) {
  const cleanPhone = phone.replace(/\D/g, ''); // remove non-digits
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

// 🚨 Main SOS trigger — called from topbar button onclick="triggerSOS()"
async function triggerSOS() {
  const confirmSOS = confirm("🚨 Send SOS to all emergency contacts?");
  if (!confirmSOS) return;

  try {
    const coords  = await getLocation();
    const contacts = await getContacts();

    if (!contacts || contacts.length === 0) {
      alert("⚠️ No emergency contacts found!\nPlease add contacts in your profile.");
      return;
    }

    const message = createMessage(coords.latitude, coords.longitude);

    // Open WhatsApp for each contact
    contacts.forEach((c, i) => {
      const phone = c.contact_1_phone || c.phone_number || c.phone;
      if (phone) {
        setTimeout(() => openWhatsApp(phone, message), i * 800);
      }
    });

    alert(`✅ SOS sent to ${contacts.length} contact(s)!`);

  } catch (err) {
    console.error("SOS error:", err);
    alert("❌ Could not get location. Please allow location access.");
  }
}

// Also support old sosBtn if it exists (for index.html)
document.addEventListener("DOMContentLoaded", () => {
  const sosBtn = document.getElementById("sosBtn");
  if (sosBtn) {
    sosBtn.addEventListener("click", triggerSOS);
  }
});
