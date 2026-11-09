const form = document.querySelector('#quote-form');
const sizeSelect = document.querySelector('#size');
const fulfillmentSelect = document.querySelector('#fulfillment');
const deliveryFields = document.querySelector('#delivery-fields');
const specialOptions = document.querySelector('#special-options');
const addressInput = document.querySelector('#address');
const addressSuggestions = document.querySelector('#address-suggestions');
const formMessage = document.querySelector('#form-message');
let config;
let addressSearchTimer;
let addressSearchController;
let currentSuggestions = [];
let activeSuggestion = -1;

function appendOptions(select, values, placeholder) {
  select.innerHTML = `<option value="" disabled selected>${placeholder}</option>` + values.map(value => `<option value="${value}">${value}</option>`).join('');
}

function renderSizes() {
  sizeSelect.innerHTML = '<option value="" disabled selected>Choose a size</option>' + config.sizes.map(size => `<option value="${size.name}" data-price="${size.priceCents ?? ''}">${size.name}${size.priceCents ? ` · from ${money(size.priceCents)}` : ' · ask for quote'}</option>`).join('');
  document.querySelector('#price-list').innerHTML = config.sizes.filter(size => size.priceCents).map(size => `<div class="price-row"><span>${size.name}</span><strong>From ${money(size.priceCents)}</strong></div>`).join('') + '<div class="price-extra">Tiered cakes, other sizes, and custom carved cakes: contact Cas for pricing.</div>';
}

function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function updateStartingPrice() {
  const selectedSize = sizeSelect.selectedOptions[0];
  const price = selectedSize?.dataset.price;
  document.querySelector('#starting-price').textContent = price ? `From ${money(Number(price))}` : 'Custom quote';

  const delivery = fulfillmentSelect.value === 'Delivery';
  deliveryFields.hidden = !delivery;
  addressInput.required = delivery;
  if (!delivery) hideAddressSuggestions();

  if (!delivery) {
    document.querySelector('#delivery-estimate').textContent = 'Final design price confirmed by Cas';
    return;
  }
  const rate = config.deliveryRatePerMile ? `${money(Math.round(config.deliveryRatePerMile * 100))} per mile` : 'per-mile rate';
  document.querySelector('#delivery-estimate').textContent = `${rate} · Cas confirms route and final charge`;
}

function hideAddressSuggestions() {
  addressSuggestions.hidden = true;
  addressInput.setAttribute('aria-expanded', 'false');
  addressInput.removeAttribute('aria-activedescendant');
  activeSuggestion = -1;
}

function formatAddress(properties) {
  const street = [properties.housenumber, properties.street || properties.name].filter(Boolean).join(' ');
  const locality = properties.city || properties.town || properties.village || properties.locality;
  return [street, locality, properties.state, properties.postcode].filter(Boolean).join(', ');
}

function isNearLytle(feature) {
  const [longitude, latitude] = feature.geometry?.coordinates || [];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const toRadians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(latitude - 29.2330215);
  const longitudeDelta = toRadians(longitude - -98.797873);
  const originLatitude = toRadians(29.2330215);
  const destinationLatitude = toRadians(latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const distanceMiles = 3958.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return distanceMiles <= 45;
}

function selectAddress(suggestion) {
  addressInput.value = suggestion.label;
  hideAddressSuggestions();
  updateStartingPrice();
}

function renderAddressSuggestions(features) {
  currentSuggestions = features
    .filter(feature => ['street', 'house'].includes(feature.properties.type))
    .filter(isNearLytle)
    .map(feature => ({ label: formatAddress(feature.properties) }))
    .filter(item => item.label)
    .slice(0, 5);
  addressSuggestions.replaceChildren();
  activeSuggestion = -1;

  currentSuggestions.forEach((suggestion, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.id = `address-suggestion-${index}`;
    option.className = 'address-suggestion';
    option.setAttribute('role', 'option');
    option.textContent = suggestion.label;
    option.addEventListener('click', () => selectAddress(suggestion));
    addressSuggestions.append(option);
  });

  addressSuggestions.hidden = currentSuggestions.length === 0;
  addressInput.setAttribute('aria-expanded', String(currentSuggestions.length > 0));
}

async function searchAddresses(query) {
  addressSearchController?.abort();
  addressSearchController = new AbortController();
  const search = new URL('https://photon.komoot.io/api/');
  search.searchParams.set('q', query);
  search.searchParams.set('limit', '10');
  search.searchParams.set('lang', 'en');
  search.searchParams.set('lat', '29.2330215');
  search.searchParams.set('lon', '-98.797873');

  try {
    const response = await fetch(search, { signal: addressSearchController.signal });
    if (!response.ok) throw new Error('Address search is unavailable.');
    const result = await response.json();
    renderAddressSuggestions(result.features || []);
  } catch (error) {
    if (error.name !== 'AbortError') hideAddressSuggestions();
  }
}

function updateOrderType() {
  const isSpecialDesign = form.querySelector('input[name="orderType"]:checked').value === 'Special design';
  specialOptions.hidden = !isSpecialDesign;
  specialOptions.disabled = !isSpecialDesign;
  const firstDesignType = specialOptions.querySelector('input[name="designTypes"]');
  firstDesignType.setCustomValidity('');
  document.querySelector('#design-theme').required = isSpecialDesign;
  document.querySelector('#special-design-notes').required = isSpecialDesign;
  validateDesignTypes();
}

function validateDesignTypes() {
  const designTypes = [...specialOptions.querySelectorAll('input[name="designTypes"]')];
  const anySelected = designTypes.some(input => input.checked);
  designTypes[0].setCustomValidity(
    !specialOptions.disabled && !anySelected ? 'Choose at least one special design option.' : ''
  );
}

function requestBody(data) {
  const selectedSize = sizeSelect.selectedOptions[0];
  const price = selectedSize?.dataset.price ? `From ${money(Number(selectedSize.dataset.price))}` : 'Custom quote';
  const delivery = data.get('fulfillment') === 'Delivery';
  const lines = [
    `Name: ${data.get('customerName')}`,
    `Email: ${data.get('email')}`,
    `Phone: ${data.get('phone')}`,
    `Request type: ${data.get('orderType')}`,
    `Occasion: ${data.get('occasion')}`,
    `Date needed: ${data.get('date')}`,
    `Size: ${data.get('size')} (${price})`,
    `Cake flavor: ${data.get('flavor')}`,
    `Filling: ${data.get('filling')}`,
    `Frosting: ${data.get('frosting')}`,
    `Pickup or delivery: ${data.get('fulfillment')}`
  ];
  if (delivery) {
    lines.push(`Delivery address: ${data.get('address')}`);
    lines.push(`Delivery area: Cas to confirm eligibility within ${config.deliveryRadiusMiles} miles of Lytle.`);
    lines.push(`Delivery charge: Cas to confirm ${config.deliveryRatePerMile ? `at ${money(Math.round(config.deliveryRatePerMile * 100))} per mile` : 'the per-mile rate'} and final amount.`);
  }
  if (data.get('orderType') === 'Special design') {
    lines.push(
      `Special design options: ${data.getAll('designTypes').join(', ')}`,
      `Theme or inspiration: ${data.get('designTheme')}`,
      `Design colors: ${data.get('designColors') || 'Not specified'}`,
      `Special design details: ${data.get('specialDesignNotes')}`
    );
  }
  lines.push('', `Additional notes: ${data.get('design') || 'None'}`, '', 'I understand the final design price and delivery charge must be confirmed by Cas.');
  return lines.join('\n');
}

fulfillmentSelect.addEventListener('change', updateStartingPrice);
addressInput.addEventListener('input', () => {
  clearTimeout(addressSearchTimer);
  addressSearchController?.abort();
  const query = addressInput.value.trim();
  if (query.length < 3) {
    hideAddressSuggestions();
    return;
  }
  addressSearchTimer = setTimeout(() => searchAddresses(query), 300);
});
addressInput.addEventListener('keydown', event => {
  if (addressSuggestions.hidden) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    activeSuggestion = (activeSuggestion + direction + currentSuggestions.length) % currentSuggestions.length;
    addressInput.setAttribute('aria-activedescendant', `address-suggestion-${activeSuggestion}`);
    addressSuggestions.querySelectorAll('[role="option"]').forEach((option, index) => {
      option.setAttribute('aria-selected', String(index === activeSuggestion));
    });
  } else if (event.key === 'Enter' && activeSuggestion >= 0) {
    event.preventDefault();
    selectAddress(currentSuggestions[activeSuggestion]);
  } else if (event.key === 'Escape') {
    hideAddressSuggestions();
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('.address-autocomplete')) hideAddressSuggestions();
});
form.querySelectorAll('input[name="orderType"]').forEach(input => input.addEventListener('change', updateOrderType));
specialOptions.addEventListener('change', event => {
  if (event.target.name === 'designTypes') validateDesignTypes();
});
form.addEventListener('submit', event => {
  event.preventDefault();
  validateDesignTypes();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const subject = `Cake quote request — ${data.get('occasion')} — ${data.get('date')}`;
  const mailto = `mailto:${config.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(requestBody(data))}`;
  formMessage.textContent = 'Your email app will open with the request details. The order is confirmed after Cas replies with the final quote.';
  window.location.href = mailto;
});

document.querySelector('#year').textContent = String(new Date().getFullYear());
document.querySelector('#date').min = new Date().toISOString().slice(0, 10);

async function initialize() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Could not load cake options. Refresh the page to try again.');
    config = await response.json();
    appendOptions(document.querySelector('#occasion'), config.occasions, 'Choose an occasion');
    appendOptions(document.querySelector('#flavor'), config.flavors, 'Choose a cake flavor');
    appendOptions(document.querySelector('#filling'), config.fillings, 'Choose a filling');
    appendOptions(document.querySelector('#frosting'), config.frostings, 'Choose a frosting');
    renderSizes();
    document.querySelector('#delivery-rate').textContent = config.deliveryRatePerMile ? `${money(Math.round(config.deliveryRatePerMile * 100))} / mile` : 'Confirmed with quote';
    updateStartingPrice();
    updateOrderType();
  } catch (error) {
    formMessage.textContent = error.message;
    form.querySelector('button[type="submit"]').disabled = true;
  }
}

initialize();