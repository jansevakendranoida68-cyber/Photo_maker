const upload = document.getElementById('upload');
const quantity = document.getElementById('quantity');
const sheet = document.getElementById('sheet');
const printBtn = document.getElementById('printBtn');
const statusBox = document.getElementById('status');
const countLabel = document.getElementById('countLabel');
const pageStyle = document.getElementById('printPageStyle');
let photoUrl = '';

// Keep the original quantity range: 1 to 60 photos.
for (let i = 1; i <= 60; i++) {
  const option = document.createElement('option');
  option.value = i;
  option.textContent = `${i} ${i === 1 ? 'photo' : 'photos'}`;
  quantity.appendChild(option);
}

function renderSheet() {
  if (!photoUrl) return;

  const count = Number(quantity.value);
  sheet.innerHTML = '';

  for (let i = 0; i < count; i++) {
    const frame = document.createElement('div');
    frame.className = 'photo';

    const img = document.createElement('img');
    img.src = photoUrl;
    img.alt = 'Passport size photo';

    frame.appendChild(img);
    sheet.appendChild(frame);
  }

  const rows = Math.ceil(count / 6);
  pageStyle.textContent = '@page { size: A4 portrait; margin: 5mm; }';
  countLabel.textContent = `${count} ${count === 1 ? 'photo' : 'photos'} · ${rows} row${rows === 1 ? '' : 's'}`;
  printBtn.disabled = false;
}

upload.addEventListener('change', () => {
  const file = upload.files && upload.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    statusBox.textContent = 'Please choose an image file.';
    return;
  }

  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(file);
  statusBox.textContent = 'Photo uploaded. Choose a quantity and print.';
  renderSheet();
});

quantity.addEventListener('change', renderSheet);

printBtn.addEventListener('click', () => {
  if (photoUrl) window.print();
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (photoUrl) URL.revokeObjectURL(photoUrl);

  photoUrl = '';
  upload.value = '';
  quantity.value = '1';
  sheet.innerHTML = '<div class="empty">Upload a photo to see your sheet here.</div>';
  countLabel.textContent = '0 photos';
  printBtn.disabled = true;
  statusBox.textContent = '';
  pageStyle.textContent = '@page { size: A4 portrait; margin: 5mm; }';
});
