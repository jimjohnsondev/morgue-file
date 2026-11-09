// The item page's notes box (frames 5, 7, 8; R11) saves itself when it loses the focus with its
// text changed, as the mocks draw it with no Save button. api-forms.ts sends its form in place,
// so the page stays as it is.

document.addEventListener('change', (event) => {
  const box = event.target;
  if (box instanceof HTMLTextAreaElement && box.hasAttribute('data-save-on-change')) {
    box.form?.requestSubmit();
  }
});
