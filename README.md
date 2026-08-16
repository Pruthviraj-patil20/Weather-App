# SKYCAST — Weather Application

A modern, responsive weather application that provides real-time weather data, forecasts, and air quality information. Built with vanilla JavaScript and CSS, SKYCAST offers a clean, intuitive interface for checking weather conditions across locations.

## Features

- **Current Weather** — Real-time temperature, conditions, and atmospheric data
- **5-Day Forecast** — Hourly forecast data for the next 5 days (3-hour intervals)
- **Air Quality** — Air pollution and quality metrics for your location
- **Favorites** — Save and quick-access your favorite locations
- **Theme Toggle** — Light and dark mode support
- **Location Services** — Search by city name or use geolocation
- **Responsive Design** — Works seamlessly on desktop, tablet, and mobile devices
- **Settings** — Customize units (Celsius/Fahrenheit), language, and preferences

## Installation

1. Clone or download this repository
2. Open the project in your preferred code editor
3. No build step required — this is a static site
4. Serve with a local server:
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js
   npx http-server
   ```
5. Open `http://localhost:8000` in your browser

## Configuration

### API Key Setup

SKYCAST uses the [OpenWeatherMap API](https://openweathermap.org/api). You'll need an API key to fetch weather data.

**Credential Resolution Order:**

1. **Environment Config** (`window.SKYCAST_CONFIG`) — Injected via:
   - `js/config.local.js` (git-ignored, not in repo)
   - Build process (recommended for production/CI)

2. **User Settings** — Supplied through the Settings panel and saved to `localStorage`

3. **Defaults** — App UI renders without data if no key is available

### Getting an API Key

1. Sign up at [OpenWeatherMap](https://openweathermap.org/api)
2. Generate a free API key (includes current weather, forecast, and air quality)
3. Add your key via:
   - **Settings Panel** — Enter in Settings → Data → API key
   - **Local Config** — Create `js/config.local.js`:
     ```javascript
     window.SKYCAST_CONFIG = {
       apiKey: 'YOUR_API_KEY_HERE'
     };
     ```

## Project Structure

```
Weather app/
├── css/                    # Stylesheets
│   ├── global.css          # Global styles and typography
│   ├── variables.css       # CSS custom properties (colors, spacing, etc.)
│   ├── reset.css           # CSS reset
│   ├── layout.css          # Page layout structure
│   ├── components.css      # Reusable component styles
│   ├── dashboard.css       # Main dashboard styles
│   ├── search.css          # Search bar styles
│   ├── forecast.css        # Forecast display styles
│   ├── favorites.css       # Favorites panel styles
│   ├── settings.css        # Settings panel styles
│   ├── animations.css      # Animations and transitions
│   ├── responsive.css      # Media queries for responsive design
│   └── index.html          # Main HTML file
│
├── js/                     # JavaScript modules
│   ├── config.js           # Central configuration
│   ├── api.js              # API wrapper (OpenWeatherMap)
│   ├── weather.js          # Weather data management
│   ├── location.js         # Geolocation and location services
│   ├── storage.js          # Local storage management
│   ├── theme.js            # Theme and dark mode handling
│   └── index.js            # Main application entry point
│
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore patterns
└── README.md               # This file
```

## Usage

### Search for a Location

1. Enter a city name in the search bar
2. Select from the suggestions dropdown
3. Weather data for that location updates automatically

### Manage Favorites

- Click the star icon on any weather card to add/remove from favorites
- Access favorite locations from the Favorites panel for quick switching

### View Forecast

- Scroll through the 5-day forecast
- Each entry shows 3-hour intervals with temperature, conditions, and precipitation

### Check Air Quality

- Air quality metrics are displayed alongside weather data
- Shows pollution levels for your current location

### Adjust Settings

Open Settings to:
- Change temperature units (°C / °F)
- Toggle between light and dark themes
- Manage your API key
- Clear data or reset preferences

## API Endpoints

SKYCAST uses the following OpenWeatherMap endpoints:

| Endpoint | Purpose | Free Tier |
|----------|---------|-----------|
| `/data/2.5/weather` | Current weather by coordinates | ✓ |
| `/data/2.5/forecast` | 5-day forecast (3-hour intervals) | ✓ |
| `/data/2.5/air_pollution` | Air quality data | ✓ |
| `/geo/1.0/direct` | City name to coordinates | ✓ |
| `/geo/1.0/reverse` | Coordinates to city name | ✓ |

## Security & Deployment

### ⚠️ Important Security Note

SKYCAST is a static, client-side application. Any API key that reaches the browser is exposed to end users. This is inherent to client-side apps.

**For Production:**
- Move API calls behind a serverless proxy (e.g., AWS Lambda, Netlify Functions, Vercel)
- Set `WEATHER_API_URL` to point to your proxy
- Keep your API key secret on the server

### Deployment Options

- **Static Hosting** — Deploy to GitHub Pages, Netlify, Vercel, or any static host
- **Docker** — Containerize with a simple web server
- **Traditional Server** — Serve via Apache, Nginx, or any web server

## Development

### Project Architecture

- **Modular Design** — Each feature is isolated in its own module
- **No Build Step** — Uses ES6 modules, works directly in modern browsers
- **localStorage** — Persists user preferences and favorite locations
- **CSS Custom Properties** — Centralized theming via CSS variables

### Adding New Features

1. Create a new module in `js/`
2. Use ES6 `import`/`export` syntax
3. Add corresponding styles in `css/`
4. Import and integrate in `js/index.js`

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires ES6 module support
- Geolocation API support (for location features)
- localStorage API (for user preferences)

## Troubleshooting

**"No API key found"**
- Add your OpenWeatherMap API key via Settings panel or `config.local.js`

**"Weather data won't load"**
- Check API key validity at OpenWeatherMap dashboard
- Verify rate limits haven't been exceeded
- Check browser console for network errors

**"Location not found"**
- Ensure geolocation permission is granted
- Try searching for a different city name
- Check internet connection

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here]

## Support

For issues or questions:
- Check the [OpenWeatherMap API documentation](https://openweathermap.org/api)
- Review browser console for error messages
- Verify API key and rate limits

---

**SKYCAST** — Your personal weather companion. Built with ❤️
# Weather-App
