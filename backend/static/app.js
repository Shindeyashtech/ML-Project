// NOTE:
// This file is kept for compatibility, but the current UI in
// backend/static/index.html uses an inline script (and different DOM ids).
// If the expected DOM elements are missing, we must NOT crash the page.

(() => {
  // Wait until DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    const identifiedDiv = document.getElementById('identified');
    const unidentifiedDiv = document.getElementById('unidentified');
    const finalizeBtn = document.getElementById('finalizeBtn');
    const autoSortBtn = document.getElementById('autoSortBtn');
    const knownPeopleDiv = document.getElementById('knownPeople');
    const sortedFoldersDiv = document.getElementById('sortedFolders');

    // If these IDs do not exist, do nothing.
    // The inline script in index.html will handle upload/scan.
    const required = [
      uploadBtn,
      fileInput,
      status,
      result,
      identifiedDiv,
      unidentifiedDiv,
      finalizeBtn,
      autoSortBtn,
      knownPeopleDiv,
      sortedFoldersDiv,
    ];

    if (required.some((el) => !el)) {
      // Silent no-op: prevents runtime errors like
      // "Cannot read properties of null".
      return;
    }

    let lastResponse = null;

    function setStatus(msg, isError = false) {
      status.textContent = msg;
      status.style.color = isError ? 'crimson' : '#444';
    }

    async function doUpload() {
      const f = fileInput.files[0];
      if (!f) {
        setStatus('Please choose an image file to upload', true);
        return;
      }
      setStatus('Uploading...');

      const fd = new FormData();
      fd.append('file', f, f.name);

      try {
        const res = await fetch('/api/process-photo', { method: 'POST', body: fd });
        if (!res.ok) {
          const text = await res.text();
          setStatus('Upload failed: ' + res.status + ' ' + text, true);
          return;
        }
        const data = await res.json();
        lastResponse = data;
        renderResult(data);

        try {
          await fetchAndRenderKnownPeople();
        } catch (e) {}
        try {
          await fetchAndRenderSortedFolders();
        } catch (e) {}

        setStatus('Scan complete.');
      } catch (err) {
        setStatus('Upload error: ' + err, true);
      }
    }

    uploadBtn.addEventListener('click', doUpload);

    fileInput.addEventListener('change', () => {
      // Optional: update UI if a file-chooser label exists in this DOM variant
      const label = document.querySelector('.file-chooser');
      if (label) {
        const f = fileInput.files[0];
        label.textContent = f ? f.name : 'Choose a photo';
      }
    });

    function renderResult(data) {
      result.style.display = '';
      identifiedDiv.innerHTML = '';
      unidentifiedDiv.innerHTML = '';
      finalizeBtn.style.display = 'none';

      const idents = data.identified_people || [];
      const unids = data.unidentified_faces || [];

      const hIdent = document.createElement('div');
      hIdent.innerHTML = '<strong>Identified people:</strong>';
      if (idents.length === 0) {
        hIdent.innerHTML += ' <em>none</em>';
      } else {
        const ul = document.createElement('ul');
        idents.forEach((n) => {
          const li = document.createElement('li');
          li.textContent = n;
          ul.appendChild(li);
        });
        hIdent.appendChild(ul);
      }
      identifiedDiv.appendChild(hIdent);

      const existingBelow = document.getElementById('finalizeBelowBtn');
      if (existingBelow) existingBelow.remove();

      if (idents.length > 0) {
        const btn = document.createElement('button');
        btn.id = 'finalizeBelowBtn';
        btn.style.marginTop = '8px';
        btn.textContent = 'Finalize & Sort (identified only)';
        btn.addEventListener('click', async () => {
          if (!lastResponse) return;
          setStatus('Finalizing & sorting identified people...');
          const temp = lastResponse.temp_photo_path;
          const identified_people = lastResponse.identified_people || [];
          const payload = { temp_photo_path: temp, identified_people, new_labels: [] };
          try {
            const res = await fetch('/api/finalize-and-sort', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const txt = await res.text();
            if (!res.ok) {
              setStatus('Finalize failed: ' + res.status + ' ' + txt, true);
              return;
            }
            setStatus('Finalize OK: ' + txt);
            if (finalizeBtn) finalizeBtn.style.display = 'none';
            if (autoSortBtn) autoSortBtn.style.display = 'none';
            btn.style.display = 'none';
          } catch (err) {
            setStatus('Finalize error: ' + err, true);
          }
        });
        identifiedDiv.appendChild(btn);
      }

      const hUnid = document.createElement('div');
      hUnid.innerHTML = '<strong>Unidentified faces (label them):</strong>';
      if (unids.length === 0) {
        hUnid.innerHTML += ' <em>none</em>';
      } else {
        const grid = document.createElement('div');
        grid.className = 'grid';
        unids.forEach((u) => {
          const card = document.createElement('div');
          card.className = 'card';

          const img = document.createElement('img');
          img.src = u.image_url;
          img.alt = u.temp_id;

          const inp = document.createElement('input');
          inp.placeholder = 'Name for this face';
          inp.type = 'text';
          inp.dataset.tempId = u.temp_id;

          card.appendChild(img);
          card.appendChild(inp);
          grid.appendChild(card);
        });
        hUnid.appendChild(grid);
        finalizeBtn.style.display = 'inline-block';

        if (idents.length > 0 && autoSortBtn) autoSortBtn.style.display = 'inline-block';
        else if (autoSortBtn) autoSortBtn.style.display = 'none';
      }
      unidentifiedDiv.appendChild(hUnid);
    }

    finalizeBtn.addEventListener('click', async () => {
      if (!lastResponse) return;
      setStatus('Finalizing...');
      const temp = lastResponse.temp_photo_path;
      const identified_people = lastResponse.identified_people || [];

      const inputs = Array.from(document.querySelectorAll('#unidentified input'));
      const new_labels = inputs
        .map((i) => ({ temp_id: i.dataset.tempId, name: i.value.trim() }))
        .filter((x) => x.name);

      const payload = { temp_photo_path: temp, identified_people, new_labels };

      try {
        const res = await fetch('/api/finalize-and-sort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const txt = await res.text();
        if (!res.ok) {
          setStatus('Finalize failed: ' + res.status + ' ' + txt, true);
          return;
        }
        setStatus('Finalize OK: ' + txt);
        finalizeBtn.style.display = 'none';
        if (autoSortBtn) autoSortBtn.style.display = 'none';
      } catch (err) {
        setStatus('Finalize error: ' + err, true);
      }
    });

    if (autoSortBtn) {
      autoSortBtn.addEventListener('click', async () => {
        if (!lastResponse) return;
        setStatus('Auto-sorting...');
        const temp = lastResponse.temp_photo_path;
        const identified_people = lastResponse.identified_people || [];
        if (identified_people.length === 0) {
          setStatus('No identified people to sort for.', true);
          return;
        }

        const payload = { temp_photo_path: temp, identified_people, new_labels: [] };
        try {
          const res = await fetch('/api/finalize-and-sort', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const txt = await res.text();
          if (!res.ok) {
            setStatus('Auto-sort failed: ' + res.status + ' ' + txt, true);
            return;
          }
          setStatus('Auto-sort OK: ' + txt);
          if (finalizeBtn) finalizeBtn.style.display = 'none';
          if (autoSortBtn) autoSortBtn.style.display = 'none';
        } catch (err) {
          setStatus('Auto-sort error: ' + err, true);
        }
      });
    }

    (async () => {
      try {
        await fetchAndRenderKnownPeople();
        await fetchAndRenderSortedFolders();
        await fetch('/api/process-photo', { method: 'OPTIONS' });
      } catch (e) {}
    })();

    async function fetchAndRenderKnownPeople() {
      if (!knownPeopleDiv) return;
      knownPeopleDiv.textContent = 'Loading...';
      try {
        const res = await fetch('/api/known-people');
        if (!res.ok) {
          knownPeopleDiv.textContent = 'Failed to load';
          return;
        }
        const data = await res.json();
        const known = data.known_people || [];
        knownPeopleDiv.innerHTML = '';
        if (known.length === 0) {
          knownPeopleDiv.innerHTML = '<em>No known people yet</em>';
          return;
        }

        const ul = document.createElement('ul');
        ul.className = 'known-list';
        known.forEach((name) => {
          const li = document.createElement('li');
          li.textContent = name;
          if (lastResponse && Array.isArray(lastResponse.identified_people)) {
            if (lastResponse.identified_people.includes(name)) {
              li.className = 'present';
              li.title = 'Present in the last scanned image';
            } else {
              li.className = 'missing';
              li.title = 'Not present in the last scanned image';
            }
          }
          ul.appendChild(li);
        });
        knownPeopleDiv.appendChild(ul);
      } catch (err) {
        knownPeopleDiv.textContent = 'Error';
      }
    }

    async function fetchAndRenderSortedFolders() {
      if (!sortedFoldersDiv) return;
      sortedFoldersDiv.textContent = 'Loading...';
      try {
        const res = await fetch('/api/sorted-folders');
        if (!res.ok) {
          sortedFoldersDiv.textContent = 'Failed to load';
          return;
        }
        const data = await res.json();
        sortedFoldersDiv.innerHTML = '';
        const names = Object.keys(data || {});
        if (names.length === 0) {
          sortedFoldersDiv.innerHTML = '<em>No sorted folders yet</em>';
          return;
        }

        const container = document.createElement('div');
        container.className = 'folders-grid';
        names.forEach((name) => {
          const files = data[name] || [];
          const card = document.createElement('div');
          card.className = 'folder-card';

          const title = document.createElement('div');
          title.className = 'folder-title';
          title.textContent = name;
          card.appendChild(title);

          if (files.length > 0) {
            const img = document.createElement('img');
            img.src = files[0];
            img.className = 'folder-thumb';
            img.alt = name;
            card.appendChild(img);
          } else {
            const p = document.createElement('div');
            p.className = 'muted';
            p.textContent = 'Empty';
            card.appendChild(p);
          }

          const count = document.createElement('div');
          count.className = 'folder-count';
          count.textContent = `${files.length} image${files.length !== 1 ? 's' : ''}`;
          card.appendChild(count);

          container.appendChild(card);
        });
        sortedFoldersDiv.appendChild(container);
      } catch (err) {
        sortedFoldersDiv.textContent = 'Error';
      }
    }
  }
})();

