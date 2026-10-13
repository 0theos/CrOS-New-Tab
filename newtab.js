/**
 * CrOS Material 3 Digital Clock
 * Updates time and localized date matching browser locale.
 */

function updateClock() {
  const now = new Date();

  // Hours and minutes
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const dateEl = document.getElementById('clock-date');

  if (hoursEl && hoursEl.textContent !== hours) {
    hoursEl.textContent = hours;
  }

  if (minutesEl && minutesEl.textContent !== minutes) {
    minutesEl.textContent = minutes;
  }

  // Localized date
  if (dateEl) {
    const locale = navigator.language || 'ru-RU';
    const formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    const dateStr = formatter.format(now);
    // Capitalize first letter (e.g. "Вторник, 13 октября")
    const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    if (dateEl.textContent !== formattedDate) {
      dateEl.textContent = formattedDate;
    }
  }
}

// Initial render
updateClock();

// Synchronize with second rollover
const delayToNextSecond = 1000 - (new Date().getMilliseconds());
setTimeout(() => {
  updateClock();
  setInterval(updateClock, 1000);
}, delayToNextSecond);
