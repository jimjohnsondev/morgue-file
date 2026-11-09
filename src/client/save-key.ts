// Ctrl+S on a page that is one form, such as the profile editor (frame 14), sends that form as
// its Save button would, instead of the browser saving the page as a file.

document.addEventListener('keydown', (event) => {
  if (!event.ctrlKey || event.altKey || event.key.toLowerCase() !== 's') {
    return;
  }
  const form = document.querySelector<HTMLFormElement>('form[data-save-key]');
  if (form !== null) {
    event.preventDefault();
    form.requestSubmit();
  }
});
