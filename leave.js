(() => {
  const leaveBtn = document.getElementById('leaveBtn');
  if (!leaveBtn) return;

  leaveBtn.addEventListener('click', () => {
    // The live WebRTC connection and all armed capabilities are in-memory only.
    // Clearing the guest credential and unloading the page closes the P2P pipe,
    // destroys those in-memory capabilities, and prevents automatic restore.
    sessionStorage.removeItem('blinkBorrowGuest');

    leaveBtn.disabled = true;
    leaveBtn.textContent = 'LEAVING…';

    // Replace removes any ?join= invite code from the address bar as well.
    location.replace(`${location.origin}${location.pathname}`);
  });
})();
