// Refresh the checked-in catalog from the public NHTSA vPIC API.
// Check-in uses the local snapshot and never waits for this service.
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const makes = ['Acura', 'Alfa Romeo', 'Aston Martin', 'Audi', 'Bentley', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge', 'Ferrari', 'Fiat', 'Fisker', 'Ford', 'Genesis', 'GMC', 'Honda', 'Hummer', 'Hyundai', 'Infiniti', 'Jaguar', 'Jeep', 'Kia', 'Lamborghini', 'Land Rover', 'Lexus', 'Lincoln', 'Lotus', 'Lucid', 'Maserati', 'Mazda', 'McLaren', 'Mercedes-Benz', 'MINI', 'Mitsubishi', 'Nissan', 'Polestar', 'Pontiac', 'Porsche', 'Ram', 'Rivian', 'Rolls-Royce', 'Saab', 'Saturn', 'smart', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo'];
const vehicles = [];
const failures = [];
let cursor = 0;
async function worker() {
  while (cursor < makes.length) {
    const make = makes[cursor++];
    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const rows = [];
        for (const type of ['passenger car', 'multipurpose passenger vehicle', 'truck']) {
          const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/vehicletype/${encodeURIComponent(type)}?format=json`, { signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (!Array.isArray(data.Results)) throw new Error('Unexpected API response');
          rows.push(...data.Results);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        const models = [...new Set(rows.map(row => row.Model_Name?.trim()).filter(model => typeof model === 'string' && model.length > 0 && model.length <= 120))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        if (!models.length) throw new Error('No models returned');
        vehicles.push({ make, models });
        console.log(`${make}: ${models.length} models`);
        success = true;
        break;
      } catch (error) {
        if (attempt === 2) failures.push(`${make}: ${error.message}`);
        else await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000));
      }
    }
    if (!success) console.error(`Could not refresh ${make}`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}
await Promise.all([worker(), worker(), worker()]);
if (failures.length) {
  console.error('Existing catalog was preserved. Resolve these errors and retry:\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  vehicles.sort((a, b) => a.make.localeCompare(b.make, 'en'));
  const catalog = { source: 'NHTSA vPIC', source_url: 'https://vpic.nhtsa.dot.gov/api/', updated_at: new Date().toISOString(), scope: 'Common car, SUV, and truck makes; includes historical models. Not a complete global catalog.', vehicles };
  const directory = fileURLToPath(new URL('../data/', import.meta.url));
  const destination = fileURLToPath(new URL('../data/vehicles.json', import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(destination + '.tmp', JSON.stringify(catalog, null, 2) + '\n');
  await rename(destination + '.tmp', destination);
  console.log(`Saved ${vehicles.length} makes and ${vehicles.reduce((sum, entry) => sum + entry.models.length, 0)} models to data/vehicles.json`);
}
