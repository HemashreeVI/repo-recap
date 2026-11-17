const t = document.getElementById('token'), msg = document.getElementById('msg');
chrome.storage.local.get('token').then(({ token }) => { t.value = token || ''; });
document.getElementById('save').onclick = async () => { await chrome.storage.local.set({ token: t.value.trim() }); msg.textContent = 'Saved ✓'; };
