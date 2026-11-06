# Tuning parameters
Reviewed 2026-11-02 at dev (ce8de5a). Designer knobs live in `src/config/tuning/`; rows that still point to code are not yet tunable.

Every value a user may want to adjust, in one place. Values that moved live in `src/config/tuning/` (one file per owner section, re-exported by `index.ts`: `buildings`, `uiCamera`, `cityStreets`, `trafficLife`, `audio`, `skyEnvironment`). Rows point there with the config key. Rows that did not move point at the code location. Sliders in the UI write to the store (`src/store/model.ts` defaults); their ranges are listed where the slider is defined.

## How to change a value

1. Edit the value in `src/config/tuning/` (one line, under the section named in the row). For values still in code, edit the constant at the file:line shown.
2. Run `npx tsc --noEmit`, then `npx vitest run` (includes `tests/tuningParity.test.ts`), then `npx vite build`.
3. Only failures are printed; success is silent.

## How to request a change

1. Tell the lead which parameter (name from this file) and the new value.
2. The lead sends it to the Owner listed in that row.
3. The owner edits the file, runs `npx tsc --noEmit`, `npx vitest run` and `npx vite build`, and reports back.
4. No commit unless the user asks.

Owner names follow `docs/agents/README.md`. For shared files, the Owner column names the lead owner and the reviewer (`lead / reviewer`).

Columns: Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner

---

## 1. Traffic and crowd density

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Density floor | 0.2 | 0..1 | Exported as the night floor; the curve already starts at 0.2, so changing it alone does nothing | src/config/tuning/trafficLife.ts (`trafficLife.densityFloor`); used by src/traffic/trafficDensity.ts | Traffic & Life |
| Density curve | 0.2 at 0-5h, peak 1.0 at 11:00 and 19:00, dip 0.7 at 15:00 | 0..1 per hour, piecewise linear | Vehicle spawn rate and walker crowd, by hour | src/traffic/trafficDensity.ts:7-28 (`TRAFFIC_DENSITY_CURVE`, stays in code) | Traffic & Life |
| Traffic & people slider default | 1.75 | multiplier, slider 0-3 step 0.05 | Scales vehicle cap, spawn points and walker cap | src/config/tuning/uiCamera.ts (`uiCamera.defaultTrafficMultiplier`); slider range src/config/tuning/uiCamera.ts (`uiCamera.multiplierMax/multiplierStep`); slider src/ui/SettingsCity.tsx | UI & Camera / Traffic & Life |
| Quality traffic factor | high 1, medium 0.75, low 0.5 | multiplier | Multiplies the Traffic & people slider per graphics tier | src/config/tuning/sceneQa.ts (`sceneQa.qualityTiers.*.traffic`); used via src/store/quality.ts | UI & Camera / Scene & QA |
| Vehicles per path | 2 | vehicles per path at multiplier 1 | Hard cap on active vehicles (cap = mult x 2 x path count) | src/config/tuning/trafficLife.ts (`trafficLife.vehiclesPerPath`) | Traffic & Life |
| Spawn interval min | 4 | seconds | Shortest gap between spawn attempts at one spawn point | src/config/tuning/trafficLife.ts (`trafficLife.spawnMinS`) | Traffic & Life |
| Spawn interval max | 10 | seconds | Longest gap between spawn attempts | src/config/tuning/trafficLife.ts (`trafficLife.spawnMaxS`) | Traffic & Life |
| Spawn point spacing | 60 | metres of path per spawn point at multiplier 1 | Number of spawn points per lane | src/config/tuning/cityStreets.ts (`cityStreets.trafficSpawnSpacing`) | City & Streets / Traffic & Life |
| Left turn chance | 0.2 | probability at a junction | Share of left turns | src/config/tuning/trafficLife.ts (`trafficLife.turnLeftChance`) | Traffic & Life |
| Right turn chance | 0.2 | probability at a junction | Share of right turns (straight = 1 - left - right = 0.6) | src/config/tuning/trafficLife.ts (`trafficLife.turnRightChance`) | Traffic & Life |
| Turn decision distance | 40 | metres before junction centre | When the manoeuvre is rolled | src/traffic/vehicles/constants.ts:29 (`DECIDE_DISTANCE`, stays in code) | Traffic & Life |
| Car cruise speed | 11 | m/s | Cruise speed of cars | src/traffic/vehicles/constants.ts:8 (`VEHICLE_SPECS.car`, stays in code) | Traffic & Life |
| Bus cruise speed | 8 | m/s | Cruise speed of buses | src/traffic/vehicles/constants.ts:9 (`VEHICLE_SPECS.bus`, stays in code) | Traffic & Life |
| Truck cruise speed | 9 | m/s | Cruise speed of trucks | src/traffic/vehicles/constants.ts:10 (`VEHICLE_SPECS.truck`, stays in code) | Traffic & Life |
| Motorbike cruise speed | 13 | m/s | Cruise speed of motorbikes | src/traffic/vehicles/constants.ts:11 (`VEHICLE_SPECS.motorbike`, stays in code) | Traffic & Life |
| Left turn speed | 5.5 | m/s | Speed through a left turn | src/config/tuning/trafficLife.ts (`trafficLife.leftTurnSpeed`) | Traffic & Life |
| Right turn speed | 4.5 | m/s | Speed through a right turn | src/config/tuning/trafficLife.ts (`trafficLife.rightTurnSpeed`) | Traffic & Life |
| Horn cooldown per vehicle | 45 | seconds | Minimum gap between horns of one vehicle | src/config/tuning/trafficLife.ts (`trafficLife.hornCooldownS`) | Audio / Traffic & Life |
| Horn global gap | 6 | seconds | Minimum gap between horns in the whole city | src/config/tuning/trafficLife.ts (`trafficLife.hornGlobalGapS`) | Audio / Traffic & Life |
| Horn chance | 0.5 | probability | Share of honk situations that actually honk | src/config/tuning/trafficLife.ts (`trafficLife.hornChance`) | Audio / Traffic & Life |
| Walker cap | 480 | walkers (max) | Hard cap on pedestrians | src/traffic/walkers/constants.ts:62 (`MAX_WALKERS`, stays in code) | Traffic & Life |
| Walkers per road | 22 | walkers per road at multiplier 1, full density | Walker cap per road segment | src/traffic/walkers/constants.ts:67 (`WALKERS_PER_ROAD`, stays in code) | Traffic & Life |
| Dog cap | 120 | dogs (max) | Hard cap on dogs with walkers | src/traffic/walkers/constants.ts:64 (`MAX_DOGS`, stays in code) | Traffic & Life |
| Dog share among walkers | 0.22 | probability per walker | Share of walkers that get a dog | src/config/tuning/trafficLife.ts (`trafficLife.dogShare`) | Traffic & Life |
| Pair chance | 0.2 | probability | Share of walkers that walk as a pair | src/traffic/walkers/constants.ts:79 (`PAIR_CHANCE`, stays in code) | Traffic & Life |
| Walker turn rate | 7 | rad/s | How fast walkers turn | src/traffic/walkers/constants.ts:81 (`TURN_RATE`, stays in code) | Traffic & Life |
| Crossing safety margin | 2.0 | seconds of red left after a crossing | Walkers start a crossing only with this margin | src/traffic/walkers/constants.ts:73 (`CROSS_MARGIN`, stays in code) | Traffic & Life |
| Walker give-up wait | 150 | seconds | After this wait a walker turns back | src/traffic/walkers/constants.ts:75 (`GIVE_UP_WAIT`, stays in code) | Traffic & Life |
| Walker wait distance | 0.45 | metres from the corner node | Where walkers wait before the curb | src/traffic/walkers/constants.ts:71 (`WAIT_DIST`, stays in code) | Traffic & Life |
| Traffic light cycle | 40 | seconds | Full signal cycle | src/config/tuning/cityStreets.ts (`cityStreets.lightTiming.cycleSeconds`) | City & Streets / Traffic & Life |
| Green per direction | 16 | seconds | NS and EW green time | src/config/tuning/cityStreets.ts (`cityStreets.lightTiming.nsGreenSeconds`, `ewGreenSeconds`) | City & Streets / Traffic & Life |
| Yellow / all-red | 2 / 2 | seconds | Yellow and all-red phases | src/config/tuning/cityStreets.ts (`cityStreets.lightTiming.yellowSeconds`, `allRedSeconds`) | City & Streets / Traffic & Life |

## 2. Life and wildlife

Base counts are scaled by the graphics tier: factor low 0.4, medium 0.7, high 1 (`src/life/common.ts:76-78`, `qualityFactor`, stays in code). Counts below are the high-tier base values.

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Pigeon count | 80 (high) | instances | Pigeons on sidewalks and roofs | src/config/tuning/trafficLife.ts (`trafficLife.pigeonCount`) | Traffic & Life |
| Flock sizes | 25 / 25 / 25 | birds per flock, 3 flocks | Flying flocks | src/life/birds.ts:460-462 (`FLOCK_DEFS`, stays in code) | Traffic & Life |
| Flock altitudes | 26 / 35 / 44 | metres | Altitude of each flock | src/life/birds.ts:460-462 (`FLOCK_DEFS.alt`, stays in code) | Traffic & Life / Sky & Environment |
| Flock speeds | 9 / 10.5 / 8.5 | m/s | Flock speed | src/life/birds.ts:460-462 (`FLOCK_DEFS.speed`, stays in code) | Traffic & Life |
| Gulls | 1 (low) or 2 | count | Gulls in the flock system | src/life/birds.ts:528 (literal, stays in code) | Traffic & Life |
| Pigeon scare radius | 4 | metres | Distance at which people scare pigeons | src/life/birds.ts:16 (`SCARE_RADIUS`, stays in code) | Traffic & Life |
| Cat count | 14 (high) | instances | Cats | src/config/tuning/trafficLife.ts (`trafficLife.catCount`) | Traffic & Life |
| Squirrel count | 10 (high), only with street trees | instances | Squirrels on street trees | src/config/tuning/trafficLife.ts (`trafficLife.squirrelCount`) | Traffic & Life |
| Butterfly/bee count | 30 (high) | instances | Butterflies and bees | src/config/tuning/trafficLife.ts (`trafficLife.butterflyCount`) | Traffic & Life |
| Film bird distance | 7 | metres | Preferred distance of the auto-film carrier bird from the camera | src/config/tuning/trafficLife.ts (`trafficLife.filmBirdDistanceM`) | Traffic & Life |
| Film bird min distance | 3 | metres | Closest the auto-film bird may come to the camera (never cuts into the view) | src/config/tuning/trafficLife.ts (`trafficLife.filmBirdMinDistanceM`) | Traffic & Life |
| Film bird scale | 2.6 | multiplier | Size of the auto-film carrier bird model | src/config/tuning/trafficLife.ts (`trafficLife.filmBirdScale`) | Traffic & Life |
| Bee share | 0.2 | fraction of butterflies/bees | Share of the 30 that are bees | src/life/pets.ts:567 (literal `n * 0.2`, stays in code) | Traffic & Life |
| Bird audio cap | 3 to 6 flap birds, max flaps 3 | birds / flaps | Wing-flap sound events | src/audio/animals.ts:35-40 (`FLAP_BIRDS_MIN/MAX`, `MAX_FLAPS`, stay in code) | Audio |
| Dog bark range | 120 | metres | Audible range of barking dogs | src/audio/animals.ts:42 (`DOG_RANGE_M`, stays in code) | Audio |
| Dog bark mean interval | 900 | seconds | Average time between barks | src/audio/animals.ts:44 (`DOG_MEAN_S`, stays in code) | Audio |
| Max barkers | 3 | count | Simultaneous barking dogs | src/audio/animals.ts:45 (`MAX_BARKERS`, stays in code) | Audio |
| Bird call level | 1 | gain | Bird call volume | src/config/tuning/audio.ts (`audio.birdLevel`) | Audio |
| Flap level | 0.55 | gain | Wing-flap volume | src/config/tuning/audio.ts (`audio.flapLevel`) | Audio |
| Dog level | 0.5 | gain | Dog bark volume | src/config/tuning/audio.ts (`audio.dogLevel`) | Audio |
| Meow level | 0.55 | gain | Cat meow volume | src/config/tuning/audio.ts (`audio.meowLevel`) | Audio |
| Ambient animal interval | 9 | seconds | Mean time between ambient animal calls | src/audio/animals.ts:25 (`AMBIENT_MEAN_S`, stays in code) | Audio |
| Owl interval | 28 | seconds | Mean time between owl calls | src/audio/animals.ts:27 (`OWL_MEAN_S`, stays in code) | Audio |

## 3. Trees and leaves

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Falling leaf pool | 160 | max live instances | Hard cap on falling leaves | src/config/tuning/skyEnvironment.ts (`skyEnvironment.leaves.maxLeaves`) | Sky & Environment / Scene & QA |
| Leaf amount default | 1 | 0..1 (slider 0-1, step 0.01) | Share of the leaf pool that may be live | src/config/tuning/uiCamera.ts (`uiCamera.defaultLeafAmount`), step 115 (`leafAmountStep`); slider src/ui/SettingsCity.tsx | UI & Camera / Sky & Environment |
| Leaf size default | 1 | multiplier (slider 0.5-3, step 0.1) | Size of each leaf | src/config/tuning/uiCamera.ts (`uiCamera.defaultLeafSize`), 117-121 (`leafSizeMin/Max/Step`); slider src/ui/SettingsCity.tsx | UI & Camera / Sky & Environment |
| Leaf base size | 1.3 x 0.7 | multiplier | Leaf silhouette scale | src/config/tuning/skyEnvironment.ts (`skyEnvironment.leaves.leafScale`) | Sky & Environment |
| Focus radius | 100 | metres (ground plane) | Crowns within this distance spawn leaves; the focus point is 12 m ahead of the camera | src/config/tuning/skyEnvironment.ts (`skyEnvironment.leaves.focusRadiusM`); focus src/scene/useTownFrame.ts (setCameraView call) | Sky & Environment / Scene & QA |
| Rest time (autumn leaves) | 10 | seconds (x 0.9-1.1) | How long an autumn leaf lies on the ground | src/config/tuning/skyEnvironment.ts (`skyEnvironment.leaves.restS`) | Sky & Environment |
| Near fade distance | 10 | metres | Leaves shrink to nothing within this distance of the camera | src/config/tuning/skyEnvironment.ts (`skyEnvironment.leaves.nearFadeM`) | Sky & Environment |
| Rest lift | 0.01 | metres | Height of a resting leaf above ground | src/environment/leaves.ts:27 (`REST_LIFT`, stays in code) | Sky & Environment |
| Leaf curl / bend / vein | 0.05 / 0.04 / 0.006 | metres | Leaf shape detail | src/environment/leaves.ts:31, 33, 35 (stay in code) | Sky & Environment |
| Autumn leaf spawn profile | density 1, size 1, spawn 6-12 m, fall 0.8 m/s | mixed | Autumn particle profile | src/environment/seasons.ts:150-161 (`PROFILES.autumn`, stays in code) | Sky & Environment |
| Spring petal profile | density 0.85, size 0.42, spawn 4-9 m | mixed | Spring petal profile | src/environment/seasons.ts:126-137 (`PROFILES.spring`, stays in code) | Sky & Environment |
| Summer pollen profile | density 0.3, size 0.13 | mixed | Summer pollen profile | src/environment/seasons.ts:138-149 (`PROFILES.summer`, stays in code) | Sky & Environment |
| Winter particles | density 0 | - | No falling particles in winter | src/environment/seasons.ts:162-173 (stays in code) | Sky & Environment |
| Autumn leaf colours | #b8402a red, #d8792c orange, #e6b93e yellow | hex | Autumn foliage gradient | src/environment/leafVariety.ts:9-11 (`AUTUMN_RED/ORANGE/YELLOW`, stay in code) | Sky & Environment / City & Streets |
| Autumn particle colours | #c8552a, #d4862a, #e0b23a, #a8452a, #b9a02e | hex | Colours of falling autumn leaves | src/environment/seasons.ts:153 (literal, stays in code) | Sky & Environment |
| Pine share | 0.6 | probability for conifer spots | Share of conifer spots that get a pine | src/config/tuning/cityStreets.ts (`cityStreets.pineShare`); lab copy src/dev/treeCompare/labNatureTrees.ts:93 (keep equal) | City & Streets / Scene & QA |
| Pine snow onset | 0.85 to 0.97 | snow cover range | Snow coverage ramp on pines | src/config/tuning/cityStreets.ts (`cityStreets.pineSnowUp`) | City & Streets |
| Pine snow cap | 0.35 | 0..1 | Maximum snow on pines | src/config/tuning/cityStreets.ts (`cityStreets.pineSnowCover`) | City & Streets |
| Tree scale | 1.35 | multiplier | Size of nature trees | src/config/tuning/cityStreets.ts (`cityStreets.treeScale`); used by src/streets/natureTrees.ts and src/scene/useTownGreenery.ts | City & Streets |
| Cluster extra | 0.5 | fraction | Extra leaf clusters per tree | src/config/tuning/cityStreets.ts (`cityStreets.clusterExtra`) | City & Streets |
| Border depth | 6 | metres | Width of tree border belt | src/config/tuning/cityStreets.ts (`cityStreets.borderDepth`) | City & Streets |
| Street tree amount default | 1 | multiplier (slider 0-3, step 0.05) | Street tree count | src/config/tuning/uiCamera.ts (`uiCamera.defaultStreetTreeMultiplier`); slider range 109-111 (`multiplierMax/Step`); slider src/ui/SettingsCity.tsx | UI & Camera / City & Streets |
| Avenue tree rate | 0.44 | trees per slot (even spread, sidewalks only) | Trees along avenues; same density as streets | src/config/tuning/cityStreets.ts (`cityStreets.treeRate.avenue`) | City & Streets |
| Street tree rate | 0.44 | trees per slot (even spread, sidewalks only) | Trees along streets; same density as avenues; opposite side staggered | src/config/tuning/cityStreets.ts (`cityStreets.treeRate.street`) | City & Streets |
| Tree spacing | half of lamp spacing (9 m) | metres | Spacing of street trees | src/city/streetscape.ts:54 (`TREE_SPACING = LAMP_SPACING / 2`, derived from config) | City & Streets |
| Plaza tree spacing / rate | 8 m / 0.7 | metres / probability | Trees in plazas | src/config/tuning/cityStreets.ts (`cityStreets.plazaTreeSpacing`), 187 (`plazaTreeRate`) | City & Streets |
| Courtyard trees | 2 to 6 | count | Conifers only; broadleaf trees inside blocks are removed | src/config/tuning/cityStreets.ts (`cityStreets.courtyardTreeMin`), 181 (`courtyardTreeMax`) | City & Streets |
| Bench chance | 0.6 | probability | Share of spots with a bench | src/config/tuning/cityStreets.ts (`cityStreets.benchChance`) | City & Streets |
| Snow flake cap | 12000 | instances | Max snowflakes | src/config/tuning/skyEnvironment.ts (`skyEnvironment.weather.maxSnowFlakes`) | Sky & Environment |
| Snow cover ramp | 0.25 + 0.9 x intensity, clamp 1 | 0..1 | Snow cover on upward faces | src/weather/weatherState.ts:94 (literal, stays in code) | Sky & Environment |
| Snow cover ease | rise 18 s, fall 25 s | seconds | How fast snow cover comes and goes | src/weather/weatherState.ts:117 (`EASE.snowCover`, stays in code) | Sky & Environment |
| Ground colours by season | per season | hex | Ground colour in each season | src/sky/state.ts:97 (`GROUND_COLORS`, stays in code) | Sky & Environment |

## 4. Lights

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Lit window share (default) | 0.35 | probability per pane | Share of lit windows on house facades | src/config/tuning/buildings.ts (`buildings.litWindowShare`) | Buildings |
| Lit window share (monuments) | 0.35 | probability | Lit windows on monuments | src/config/tuning/buildings.ts (`buildings.litWindowShareMonument`) | Buildings |
| Lit window share (ground floor, others) | 0.55 / 0.6 / 0.4 | probability | Overrides in ground, roof and detail code | src/config/tuning/buildings.ts (`buildings.litWindowShareGround`, `buildings.litWindowShareGroundAlt`, `buildings.litWindowShareRoof`) | Buildings |
| Night emissive (house walls) | 1.15 | multiplier | Glow of lit windows at night | src/config/tuning/buildings.ts (`buildings.nightEmissive`) | Buildings |
| Lit window colour | #ffcf7a | hex | Colour of lit windows | src/config/tuning/buildings.ts (`buildings.litWindowColor`) | Buildings |
| Sign night emissive | 1.0 | multiplier | Shop sign glow at night | src/config/tuning/buildings.ts (`buildings.signNightEmissive`) | Buildings |
| House lamps ramp | on below +4 deg, full at -2 deg sun altitude | degrees | Dusk ramp of house lamps and lit windows | src/config/tuning/skyEnvironment.ts (`skyEnvironment.lights.houseLampsOnDeg`), 330 (`houseLampsFullDeg`) | Sky & Environment |
| Shop lights ramp | on below +2 deg, full at -4 deg | degrees | Shop lights after dusk | src/config/tuning/skyEnvironment.ts (`skyEnvironment.lights.shopLightsOnDeg`), 334 (`shopLightsFullDeg`) | Sky & Environment |
| Lights on rule | sun altitude below 0 deg | degrees | Global "lights on" flag (house and street lights) | src/config/tuning/skyEnvironment.ts (`skyEnvironment.lights.lightsOnBelowDeg`) | Sky & Environment |
| Vehicle headlights level | full at -8 deg sun altitude | degrees | Headlight strength | src/config/tuning/skyEnvironment.ts (`skyEnvironment.lights.headlightFullDeg`) | Sky & Environment / Traffic & Life |
| Late-night window fade | 100% to 30% from 22:00 to 02:00, back by 04:00-06:00 | hours | Windows go out in the small hours | src/environment/sun.ts:186-189 (literal, stays in code) | Sky & Environment |
| Street lamp spacing | 18 | metres | Distance between street lamps | src/config/tuning/cityStreets.ts (`cityStreets.streetLampSpacing`); used by src/city/streetscape.ts | City & Streets |
| Lamp height | 4.5 | metres | Street lamp height | src/streets/furniture.ts:22 (`LAMP_HEIGHT`, geometry, stays in code) | City & Streets |
| Lamp glass night intensity | 2.4 | multiplier | Glow of street lamp glass at night | src/config/tuning/cityStreets.ts (`cityStreets.lampGlassNightIntensity`) | City & Streets |
| Signal lamp gains | on 2.2, off 0.1 | multiplier | Traffic light brightness | src/config/tuning/cityStreets.ts (`cityStreets.signalOnGain`), 195 (`signalOffGain`) | City & Streets |
| Night bloom | strength 0.5 (day 0.15), threshold 0.7 (day 0.92), radius 0.6 (day 0.4) | mixed | Bloom at night for windows and lamps | src/config/tuning/sceneQa.ts (`sceneQa.nightBloom`); used by src/scene/PostFX.tsx | Scene & QA |
| Headlight glow cap | 640 | pools | Max headlight and brake glow pools | src/traffic/vehicleMeshes.ts:46 (`GLOW_CAP`, stays in code) | Traffic & Life |

## 5. Weather and sky

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Weather intensity default | 0.6 | 0..1 (slider 0-1, step 0.01) | Strength of the weather | src/config/tuning/uiCamera.ts (`uiCamera.defaultWeatherIntensity`), 113 (`intensityStep`); slider src/ui/SettingsCity.tsx | UI & Camera / Sky & Environment |
| Intensity lift on weather change | below 0.15 lifts to 0.6 | 0..1 | Makes a picked weather visible | src/config/tuning/uiCamera.ts (`uiCamera.weatherLiftBelow`), 125 (`weatherLiftTo`) | UI & Camera |
| Max rain by kind | rain 0.75, storm 1.0, others 0 | 0..1 | Rain amount at intensity 1 | src/config/tuning/skyEnvironment.ts (`skyEnvironment.weather.rainCapRain`), 349 (`rainCapStorm`) | Sky & Environment |
| Rain streaks cap | 14000 | instances | Max rain streaks | src/config/tuning/skyEnvironment.ts (`skyEnvironment.weather.maxRainStreaks`) | Sky & Environment |
| Rain ripples cap | 280 | instances | Max ground ripples | src/config/tuning/skyEnvironment.ts (`skyEnvironment.weather.maxRainRipples`) | Sky & Environment |
| Fog banks cap | 48 | instances | Max fog banks | src/config/tuning/skyEnvironment.ts (`skyEnvironment.weather.maxFogBanks`) | Sky & Environment |
| Fog colours | #aeb4bb fog, #5c6672 storm, #c8cfd8 snow | hex | Fog colours by weather | src/weather/fog.ts:21-23 (literal, stays in code) | Sky & Environment |
| Lightning flash length | 0.15 to 0.4 | seconds | Flash duration | src/config/tuning/skyEnvironment.ts (`skyEnvironment.weather.lightningFlashMinS`), 361 (`lightningFlashMaxS`) | Sky & Environment |
| Bolt visible distance | 700 | metres | Strikes further than this show no bolt | src/config/tuning/skyEnvironment.ts (`skyEnvironment.weather.boltVisibleM`) | Sky & Environment |
| Lightning strike gap | 6 - 3.5 x intensity, plus 10 - 5 x intensity random | seconds | Time between strikes in a storm | src/weather/Lightning.ts:121-122 (literal, stays in code) | Sky & Environment |
| Cloud count | 10 | clusters (about 14 = mostly cloudy) | Cloud amount; maps to coverage count/20, clamp 0.1-0.9 | src/config/tuning/skyEnvironment.ts (`skyEnvironment.clouds.sceneCount`), used by src/scene/Town.tsx; src/environment/clouds.ts:42-44 | Sky & Environment / Scene & QA |
| Cloud base and top | base 70-100 m, top 140 m | metres | Cloud altitude band | src/config/tuning/skyEnvironment.ts (`skyEnvironment.clouds.baseMinM`), 383 (`baseMaxM`), 385 (`topMaxM`) | Sky & Environment |
| Cloud cell | 90 | metres | Mean spacing of cloud clusters | src/config/tuning/skyEnvironment.ts (`skyEnvironment.clouds.cellM`) | Sky & Environment |
| Cloud shadow darkness | 0.35 | fraction | Darkest ground under a cloud | src/config/tuning/skyEnvironment.ts (`skyEnvironment.clouds.maxDarkness`) | Sky & Environment |
| Cloud drift | 1.2 to 4 m/s, 0.32 of wind | m/s | Cloud drift speed | src/config/tuning/skyEnvironment.ts (`skyEnvironment.clouds.windFactor`), 393 (`minDriftMs`), 395 (`maxDriftMs`) | Sky & Environment |
| Sun disc size | 0.05 x 0.3 at zenith, 0.05 x 1.55 at horizon, scale 0.4 | sky units | Sun disc radius | src/config/tuning/skyEnvironment.ts (`skyEnvironment.sky.oldSunRadius`), 370 (`sunHorizonGrowth`), 372 (`discScale`), 376 (`sunZenithFactor`) | Sky & Environment |
| Moon disc size | 0.045 x 0.4 | sky units | Moon disc radius | src/config/tuning/skyEnvironment.ts (`skyEnvironment.sky.oldMoonRadius`), 372 (`discScale`) | Sky & Environment |
| Day length | 1440 | real seconds (24 min) | One in-app day in auto time | src/config/tuning/uiCamera.ts (`uiCamera.dayLengthS`) | UI & Camera / Sky & Environment |
| Time of day slider | 0-24, step 0.25 | hours | Clock; default 17.5 | src/config/tuning/uiCamera.ts (`uiCamera.defaultTimeOfDay`), 91 (`timeMax`), 93 (`timeStep`); slider src/ui/SettingsCity.tsx | UI & Camera |
| Panel shift glide | 1.5 | seconds (real time) | How long the overview glides to re-centre the town when a side panel opens or closes | src/config/tuning/uiCamera.ts (`uiCamera.panelShiftSeconds`); spring src/scene/cameraMath.ts (`stepViewShift`), used in src/scene/CameraRig.tsx | UI & Camera |
| Panel slide open / close | 0.3 / 0.22 | seconds | Slide time of side panels and settings sections (open ease-out, close ease-in; instant under reduced motion) | src/config/tuning/uiCamera.ts (`uiCamera.panelAnimSeconds`, `panelCloseSeconds`); CSS vars via src/ui/slide.ts, rules `.mw-slide` in src/ui/panels.css | UI & Camera |
| Golden Hour button time | 18 | hours (6:00 PM) | Time the Golden Hour button sets; auto time off, simulation keeps running | src/config/tuning/uiCamera.ts (`uiCamera.goldenHourTime`); button src/ui/SettingsCity.tsx, action src/ui/goldenHour.ts | UI & Camera |
| Overview camera direction | [0, 2.45, 0.63] (up, back) | unitless | Camera height and distance of the standard overview (same angle, larger distance than before) | src/config/tuning/uiCamera.ts (`uiCamera.overviewDirection`); parity in tests/tuningParity.test.ts | UI & Camera / Scene & QA |
| Golden-hour shadow clamp | 24 | degrees | Minimum elevation of the shadow-casting sun | src/scene/townShadow.ts:15 (`MIN_LIGHT_ELEVATION_DEG`, stays in code) | Scene & QA / Sky & Environment |
| Golden phase threshold | altitude below 6 deg | degrees | When the phase is "golden" | src/environment/sun.ts:162 (literal, stays in code) | Sky & Environment |
| Golden glow curve | smoothstep(14,5) x smoothstep(-6,0) | degrees | Sun glow width at golden hour | src/sky/state.ts:184 (literal, stays in code) | Sky & Environment |
| Sun gain | 3.4 | multiplier | Sun light brightness | src/config/tuning/sceneQa.ts (`sceneQa.sunGain`); used by src/scene/townShadow.ts (`SUN_GAIN`) | Scene & QA / Sky & Environment |
| Hemisphere gain | 3 | multiplier | Sky fill light | src/config/tuning/sceneQa.ts (`sceneQa.hemiGain`); used by src/scene/townShadow.ts (`HEMI_GAIN`) | Scene & QA / Sky & Environment |
| Ambient gain | 0.5 | multiplier | Ambient light | src/config/tuning/sceneQa.ts (`sceneQa.ambientGain`); used by src/scene/townShadow.ts (`AMBIENT_GAIN`) | Scene & QA / Sky & Environment |
| Sun distance | 220 | metres | Distance of the shadow light | src/scene/townShadow.ts:25 (`SUN_DISTANCE`, stays in code) | Scene & QA |
| Shadow far plane | 600 | metres | Shadow camera far plane | src/scene/Town.tsx (literal, stays in code) | Scene & QA |
| Shadow normal bias | 0.04 | metres | Shadow acne control | src/scene/Town.tsx (literal, stays in code) | Scene & QA |
| Location | lat 21.03, lng 105.85, UTC+7 (Hanoi) | degrees / hours | Sun and moon position | src/environment/sun.ts:16 (`DEFAULT_LOCATION`, stays in code) | Sky & Environment |
| Default date | 2026-03-20 | date | Calendar day for the sun orbit | src/environment/sun.ts:25 (`DEFAULT_DATE`, stays in code) | Sky & Environment |
| Wind speed default | 5 | m/s (slider 0-20, step 0.1) | Wind strength | src/config/tuning/uiCamera.ts (`uiCamera.defaultWindSpeed`), 95 (`windSpeedMax`), 97 (`windSpeedStep`); slider src/ui/SettingsCity.tsx | UI & Camera / Sky & Environment |
| Wind direction default | 315 | degrees (slider 0-359) | Wind direction | src/config/tuning/uiCamera.ts (`uiCamera.defaultWindDirection`), 99 (`windDirectionMax`), 101 (`windDirectionStep`); slider src/ui/SettingsCity.tsx | UI & Camera |
| Gust attack / decay | 0.6 s / 3 s | seconds | Gust timing | src/environment/wind.ts:28, 30 (`GUST_ATTACK_S`, `GUST_DECAY_TAU_S`, stay in code) | Sky & Environment |
| Turbulence amplitude | 0.25 | fraction | Wind turbulence | src/environment/wind.ts:32 (`TURBULENCE_AMPLITUDE`, stays in code) | Sky & Environment |
| Aircraft flights per day | 24 | flights | Scheduled flights | src/aircraft/schedule.ts:26-27 (`FLIGHTS_PER_DAY_MIN/MAX`, stay in code) | Sky & Environment |
| Opening flight tilt | 8 | degrees | Diagonal of the opening aircraft across the view | src/config/tuning/skyEnvironment.ts (`skyEnvironment.aircraft.introTiltDeg`) | Sky & Environment |
| Aircraft speed | 22.4 to 50.4 | m/s | Flight speed range | src/aircraft/schedule.ts:18-19 (`SPEED_MIN/MAX`, stay in code) | Sky & Environment |
| Aircraft altitude max | min(300, camera limit - 100) | metres | Max flight altitude | src/aircraft/schedule.ts:16 (`ALTITUDE_MAX`, stays in code) | Sky & Environment |
| Aircraft spawn radius | 900 to 1020 | metres | Distance where flights appear | src/aircraft/schedule.ts:21-22 (`SPAWN_RADIUS_MIN/MAX`, stay in code) | Sky & Environment |

## 6. Audio

Master and category defaults are set in the mixer; category list is in `src/audio/bus.ts:13-30`.

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Mixer default: master | 40 | 0-100 | Master volume at start | src/config/tuning/audio.ts (`audio.mixerDefaults.master`); used by src/ui/SoundMixer.tsx | Audio |
| Master volume default | 0.4 | 0..1 | Master volume at start (was 0.8) | src/config/tuning/audio.ts (`audio.masterVolumeDefault`) | Audio |
| Mixer default: effects, nature, music | 100 each | 0-100 | Group volumes at start | src/config/tuning/audio.ts (`audio.mixerDefaults`) | Audio |
| Category gain at start | engine, horn, indicator 0.5; voice 0.6; footstep 0.45; dog, cat 0.8; others 1 | 0-1 | Per-category level at start (quieter close-range sources) | src/config/tuning/audio.ts (`audio.categoryDefaults`), used by src/audio/bus.ts defaultVolumes | Audio |
| Mixer slider range | 0-100 step 1 | 0-100 | Slider limits | src/ui/SoundMixer.tsx:179-181, 202-204 (stay in code) | Audio |
| Mixer storage keys | myworld3d.mixer.v1 | key | Saved mixer settings | src/ui/SoundMixer.tsx:17 (`MIXER_STORAGE_KEY`, stays in code) | Audio |
| Mixer smoothing | 0.03 | seconds | Volume smoothing | src/audio/bus.ts:95 (`SMOOTH_S`, stays in code) | Audio |
| Aerial height | 45 | metres | Above this, crickets and bells are silent | src/config/tuning/audio.ts (`audio.aerialHeightM`) | Audio |
| Cricket window | 22:00 to 05:00 | clock hours | When crickets sing | src/config/tuning/audio.ts (`audio.cricketStartH`), 261 (`cricketEndH`) | Audio |
| Crickets on | true | boolean | Master switch for crickets | src/config/tuning/audio.ts (`audio.cricketsEnabled`) | Audio |
| Cricket count and range | max 4, 10 to 60 m | count / metres | Number of crickets and their distance | src/config/tuning/audio.ts (`audio.cricketMax`), 269 (`cricketMinM`), 271 (`cricketMaxM`) | Audio |
| Cricket level | 0.1 | gain | Cricket volume | src/config/tuning/audio.ts (`audio.cricketLevel`) | Audio |
| Cricket season factor | summer 1, autumn 0.5 | fraction | Cricket density by season | src/config/tuning/audio.ts (`audio.cricketSummerDensity`), 265 (`cricketAutumnDensity`) | Audio |
| Bell spacing | 3.2 | seconds | Time between strikes | src/config/tuning/audio.ts (`audio.bellSpacingS`) | Audio |
| Bell range | 400 | metres | Bell audible range | src/config/tuning/audio.ts (`audio.bellRangeM`) | Audio |
| Bell level | 0.14 | gain | Bell volume | src/config/tuning/audio.ts (`audio.bellLevel`) | Audio |
| Bell pitch and height | 230 Hz, 25 m | Hz / metres | Bell tone and position | src/audio/nature.ts:51, 54 (`BELL_HZ`, `BELL_Y`, stay in code) | Audio |
| Leaf rustle distance | 70 | metres | Audible range of leaf rustle | src/config/tuning/audio.ts (`audio.rustleRangeM`) | Audio |
| Leaf rustle interval | 8 to 12 | seconds | Time between rustles | src/audio/nature.ts:25-26 (`RUSTLE_INTERVAL_MIN_S/MAX_S`, stay in code) | Audio |
| Leaf rustle min wind | 1.5 | m/s | Wind below this is silent | src/audio/nature.ts:27 (`RUSTLE_MIN_WIND`, stays in code) | Audio |
| Leaf rustle gain | 0.55 | gain | Rustle volume | src/config/tuning/audio.ts (`audio.rustleGain`) | Audio |
| Whistle wind range | 8 to 14 | m/s | Wind whistle onset and full level | src/audio/nature.ts:38-39 (stay in code) | Audio |
| Rain drop emitters | 10 max, 4 bed | count | Rain sound emitters | src/config/tuning/audio.ts (`audio.maxDropEmitters`), 287 (`bedEmitters`) | Audio |
| Rain on threshold | 0.05 | 0..1 | Rain sound starts | src/audio/rain.ts:17 (`RAIN_ON`, stays in code) | Audio |
| Rain drop radius | 3 to 60 | metres | Drop sound spread | src/audio/rain.ts:23-24 (`MIN_RADIUS`, `MAX_RADIUS`, stay in code) | Audio |
| Puddle level | 0.3 | gain | Puddle sound volume | src/config/tuning/audio.ts (`audio.puddleLevel`) | Audio |
| Pedestrian rain on/off | 0.15 on, 0.1 off | 0..1 | Umbrella and rain step sounds | src/audio/people.ts:37-38 (`RAIN_ON`, `RAIN_OFF`, stay in code) | Audio |
| Thunder range and height | 450 m max, 60 m height | metres | Thunder placement | src/audio/weather.ts:12, 14 (`THUNDER_MAX_PLACE_DISTANCE`, `THUNDER_HEIGHT`, stay in code) | Audio |
| Thunder loudness | 2 | gain | Thunder volume | src/config/tuning/audio.ts (`audio.thunderLoudness`) | Audio |
| Music level | 0.8 | gain | Music volume | src/config/tuning/audio.ts (`audio.musicLevel`) | Audio |
| Music duck level | 0.55 | gain | Music volume when ducked | src/config/tuning/audio.ts (`audio.duckLevel`) | Audio |
| UI cue level | 0.35 | gain | Panel open/close cue volume (times master and effects sliders) | src/config/tuning/audio.ts (`audio.uiCueLevel`) | Audio |
| UI cue min gap | 0.06 | seconds | Quicker repeated panel cues are dropped | src/config/tuning/audio.ts (`audio.uiCueMinGapS`) | Audio |
| UI cue ticks | 7 | count | Clockwork ratchet ticks per panel cue | src/config/tuning/audio.ts (`audio.uiCueTicks`) | Audio |
| UI cue duration | 0.26 | seconds | First to last ratchet tick of a panel cue | src/config/tuning/audio.ts (`audio.uiCueDurationS`) | Audio |
| UI cue single tick level | 0.75 | gain | House/block switch tick against one ratchet tick | src/config/tuning/audio.ts (`audio.uiCueTickLevel`) | Audio |
| Music fade | 2 | seconds | Mood crossfade | src/audio/music.ts:17 (`FADE_SECONDS`, stays in code) | Audio |
| Music mood hours | dawn 6.5 golden, golden 17-19 | clock hours | Which mood plays when | src/audio/music.ts:26-33 (`MOOD_KEYS`, stays in code) | Audio |
| Vehicle engine voices | 8 | voices | Max simultaneous engine sounds | src/audio/vehicles.ts:27 (`ENGINE_VOICES`, stays in code) | Audio |
| Vehicle horn distance | 220 | metres | Horn audible range | src/audio/vehicles.ts:33 (`HORN_MAX_DISTANCE`, stays in code) | Audio |
| Air brake level | 0.4 | gain | Air brake volume | src/config/tuning/audio.ts (`audio.airBrakeLevel`) | Audio |
| Aircraft gain | 1 | gain | Jet volume | src/config/tuning/audio.ts (`audio.jetGain`) | Audio |
| Aircraft fade | in 3 s, out 2.5 s | seconds | Aircraft sound fades | src/audio/aircraft.ts:17-18 (stay in code) | Audio |

## 7. Buildings and city

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Floors, min | 2 | floors | Minimum floors of a house | src/config/tuning/buildings.ts (`buildings.minFloors`); HousePanel slider src/ui/HousePanel.tsx:102 | Buildings / UI & Camera |
| Floors, max | 8 | floors | Maximum floors of a house | src/config/tuning/buildings.ts (`buildings.maxFloors`); HousePanel slider src/ui/HousePanel.tsx:103 | Buildings / UI & Camera |
| Floors per street class | avenue 5-7, street 3-6 | floors, inclusive | Floor count by street class | src/config/tuning/cityStreets.ts (`cityStreets.floorRange`) | City & Streets |
| House presets | 10 entries (as-block plus 9 styles) | list | Preset choices in the house panel | src/config/tuning/buildings.ts (`buildings.housePresets`); re-exported by src/store/model.ts and src/buildings/house.ts | UI & Camera / Buildings |
| Monument list | hospital, stadium, funfair, swimming-pool, dinosaur-park, supermarket, open-air-theatre, circus, fire-station, gothic-cathedral, city-hall, school | list | Monument kinds | src/config/tuning/buildings.ts (`buildings.monumentKinds`); re-exported by src/store/model.ts and src/buildings/monument.ts | UI & Camera / Buildings |
| Monument share | 0.2 | share of buildable blocks (1 in 5) | Share of buildable blocks that are public buildings. Exact per seed: round(blocks x share), at least 2, at most all blocks | src/config/tuning/cityStreets.ts (`cityStreets.monumentShare`, used by src/city/generate.ts) | City & Streets |
| Default monument size | 34 | metres | Footprint of monuments | src/buildings/monument.ts:35 (`DEFAULT_MONUMENT_SIZE`, geometry, stays in code) | Buildings |
| Hospital dormer lit share | 0.3 | probability | Lit dormer windows, hospital | src/config/tuning/buildings.ts (`buildings.hospitalDormerLitShare`) | Buildings |
| Hospital crowd | 8 | people | Forecourt crowd, hospital | src/config/tuning/buildings.ts (`buildings.hospitalCrowd`) | Buildings |
| Fire station door lit share | 0.6 | probability | Lit bay-door panes, fire station | src/config/tuning/buildings.ts (`buildings.fireDoorLitShare`) | Buildings |
| Fire station tower lit share | 0.25 | probability | Lit hose-tower windows | src/config/tuning/buildings.ts (`buildings.fireTowerLitShare`) | Buildings |
| Supermarket pane lit share | 0.85 | probability | Lit glass panes of the front | src/config/tuning/buildings.ts (`buildings.supermarketPaneLitShare`) | Buildings |
| Car park row A occupancy | 0.6 | probability per bay | Cars in supermarket row A | src/config/tuning/buildings.ts (`buildings.carParkRowAOccupancy`) | Buildings |
| Car park row B occupancy | 0.55 | probability per bay | Cars in supermarket row B | src/config/tuning/buildings.ts (`buildings.carParkRowBOccupancy`) | Buildings |
| Car park row B forward share | 0.7 | probability | Row B cars facing the entrance | src/config/tuning/buildings.ts (`buildings.carParkRowBForwardShare`) | Buildings |
| Stadium crowd | 14 | people | Forecourt crowd, stadium | src/config/tuning/buildings.ts (`buildings.stadiumCrowd`) | Buildings |
| Funfair crowd | 22 | people | Visitors, funfair | src/config/tuning/buildings.ts (`buildings.funfairCrowd`) | Buildings |
| Pool lounger person share | 0.4 | probability per lounger | People lying on loungers | src/config/tuning/buildings.ts (`buildings.poolLoungerPersonShare`) | Buildings |
| Pool facade lit share | 0.5 | probability | Lit cabin-facade panes, pool | src/config/tuning/buildings.ts (`buildings.poolFacadeLitShare`) | Buildings |
| Circus crowd | 10 | people | Crowd by the entrance, circus | src/config/tuning/buildings.ts (`buildings.circusCrowd`) | Buildings |
| Circus wagon lit share | 0.5 | probability | Lit wagon windows | src/config/tuning/buildings.ts (`buildings.circusWagonLitShare`) | Buildings |
| Cathedral apse lit share | 0.4 | probability | Lit apse and ambulatory windows | src/config/tuning/buildings.ts (`buildings.cathedralApseLitShare`) | Buildings |
| Cathedral nave lit share | 0.35 | probability | Lit nave and choir windows | src/config/tuning/buildings.ts (`buildings.cathedralNaveLitShare`) | Buildings |
| Cathedral west tower lit share | 0.4 | probability | Lit west-tower windows | src/config/tuning/buildings.ts (`buildings.cathedralWestTowerLitShare`) | Buildings |
| Cathedral crowd | 12 | people | Parvis crowd, cathedral | src/config/tuning/buildings.ts (`buildings.cathedralCrowd`) | Buildings |
| Cathedral stone palette | #b3a286, #a89c88, #b8a683 | hex list | Wall stone colours (darker warm stone) | src/config/tuning/buildings.ts (`buildings.cathedralStonePalette`) | Buildings |
| Cathedral stone jitter | 0.04 | HSL lightness | Tone spread per wall piece (aged, not one flat stone) | src/config/tuning/buildings.ts (`buildings.cathedralStoneJitter`) | Buildings |
| Cathedral roof jitter | 0.03 | HSL lightness | Tone spread per roof piece (aged slate and zinc) | src/config/tuning/buildings.ts (`buildings.cathedralRoofJitter`) | Buildings |
| Cathedral roof slate | #3a414c | hex | Slate roof colour | src/config/tuning/buildings.ts (`buildings.cathedralRoofSlate`) | Buildings |
| Cathedral roof zinc | #5d8076 | hex | Patina-green zinc roof colour | src/config/tuning/buildings.ts (`buildings.cathedralRoofZinc`) | Buildings |
| Monument shadow kinds | gothic-cathedral | list | Monument kinds whose body casts a sun shadow; others are shadow-free | src/config/tuning/buildings.ts (`buildings.monumentShadowKinds`); used by src/scene/useTownPieces.ts | Buildings / Scene & QA |
| Cathedral rose lit share | 0.5 | probability | Rose window discs lit at night | src/config/tuning/buildings.ts (`buildings.cathedralRoseLitShare`) | Buildings |
| Dinosaur park fern count | 10 | count | Ferns on the lawn | src/config/tuning/buildings.ts (`buildings.dinosaurFernCount`) | Buildings |
| Theatre audience count | 24 | people | Seated audience on the cavea | src/config/tuning/buildings.ts (`buildings.theatreAudienceCount`) | Buildings |
| Theatre door lit share | 1 | probability | Centre opening of the scaenae lit | src/config/tuning/buildings.ts (`buildings.theatreDoorLitShare`) | Buildings |
| City hall window lit share | 0.4 | probability | Lit hall windows, city hall | src/config/tuning/buildings.ts (`buildings.cityHallWindowLitShare`) | Buildings |
| School tree count | 6 | trees | Trees along the playground edge, school | src/config/tuning/buildings.ts (`buildings.schoolTreeCount`) | Buildings |
| Block frontage | 6 to 13 | metres | Lot width | src/city/blocks.ts:8-9 (`MIN_FRONTAGE`, `MAX_FRONTAGE`, geometry, stay in code) | City & Streets |
| Block depth | 10 to 14 (small block 8) | metres | Lot depth | src/city/blocks.ts:11-14 (`MIN_DEPTH`, `MAX_DEPTH`, `SMALL_BLOCK_DEPTH`, geometry, stay in code) | City & Streets |
| Courtyard minimum | 6 | metres | Smallest courtyard | src/city/blocks.ts:16 (`MIN_COURTYARD`, geometry, stays in code) | City & Streets |
| Plaza margin | 5 | metres | Plaza inset | src/city/blocks.ts:18 (`PLAZA_MARGIN`, geometry, stays in code) | City & Streets |
| Cell size target | 50 (range 40-60) | metres | Size of city grid cells | src/city/generate.ts:34-36 (`CELL_TARGET`, `CELL_MIN`, `CELL_MAX`, geometry, stay in code) | City & Streets |
| Minimum block | 6 | metres | Smallest block | src/city/generate.ts:38 (`MIN_BLOCK`, geometry, stays in code) | City & Streets |
| Grid margin | 6 | metres | Margin around the grid | src/city/generate.ts:32 (`GRID_MARGIN`, geometry, stays in code) | City & Streets |
| Avenue width / sidewalk | 11 / 4.5 | metres | Avenue size | src/city/generate.ts:29-30 (`AVENUE_WIDTH`, `AVENUE_SIDEWALK`, geometry, stay in code) | City & Streets |
| Street width / sidewalk | 8 / 3 | metres | Street size | src/city/generate.ts:27-28 (`STREET_WIDTH`, `STREET_SIDEWALK`, geometry, stay in code) | City & Streets |
| Merge block range | 2 to 4 | blocks | Blocks that may merge into one | src/city/merge.ts:11-12 (`MERGE_MIN_BLOCKS`, `MERGE_MAX_BLOCKS`, geometry, stay in code) | City & Streets |
| Town width default | 217 | metres (slider 100-400) | Town width | src/config/tuning/uiCamera.ts (`uiCamera.defaultTownWidth`), 103-107 (`townMin/townMax/townStep`); slider src/ui/SettingsCity.tsx | UI & Camera / City & Streets |
| Town depth default | 217 | metres (slider 100-400) | Town depth | src/config/tuning/uiCamera.ts (`uiCamera.defaultTownDepth`), 103-107 (`townMin/townMax/townStep`); slider src/ui/SettingsCity.tsx | UI & Camera / City & Streets |
| Party wall gap | 0.025 | metres | Gap between neighbouring houses | src/buildings/house.ts:39 (`PARTY_GAP`, geometry, stays in code) | Buildings |
| Seed default | 1 | integer | Default city seed | src/config/tuning/uiCamera.ts (`uiCamera.defaultSeed`) | UI & Camera |

## 8. Performance

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Quality tier default | high | tier | Starting graphics tier | src/config/tuning/uiCamera.ts (`uiCamera.defaultQuality`) | UI & Camera |
| Pixel ratio cap | high 2, medium 1.5, low 1 | DPR | Render resolution | src/config/tuning/sceneQa.ts (`sceneQa.qualityTiers.*.dprMax`); used via src/store/quality.ts (`QUALITY_PRESETS`) | Scene & QA |
| Shadow map size | high 4096, medium 2048, low 1024 | texels | Shadow resolution | src/config/tuning/sceneQa.ts (`sceneQa.qualityTiers.*.shadowMap`); used via src/store/quality.ts | Scene & QA |
| Bloom multiplier | high 1, medium 0.6, low 0 | multiplier | Bloom strength; 0 turns the pass off | src/config/tuning/sceneQa.ts (`sceneQa.qualityTiers.*.bloom`); used via src/store/quality.ts | Scene & QA |
| MSAA samples | high 4, medium 4, low 2 | samples | Antialiasing | src/config/tuning/sceneQa.ts (`sceneQa.qualityTiers.*.msaa`); used via src/store/quality.ts | Scene & QA |
| Quality suggestion | heuristic only | tier | Suggests a tier, never applies it | src/store/quality.ts:49-60 (`suggestQuality`, stays in code) | UI & Camera |
| Life quality factor | low 0.4, medium 0.7, high 1 | multiplier | Scales all life counts | src/life/common.ts:76-78 (`qualityFactor`, stays in code) | Traffic & Life |
| Budget: main-pass triangles | max 1,900,000 (measured 1,581,859 on seed 1) | triangles | Test threshold | tests/budget.test.ts (assertion, not a knob) | Scene & QA / Architect |
| Budget: block main triangles | 1,100,000 to 1,140,000 | triangles | Test range | tests/budget.test.ts (assertion, not a knob) | Scene & QA |
| Budget: shadow triangles | max 605,000 (measured 592,339 on seed 1) | triangles | Test threshold | tests/budget.test.ts (assertion, not a knob) | Scene & QA |
| Budget: main + shadow | max 2,300,000 (measured 2,174,198 on seed 1) | triangles | Test threshold | tests/budget.test.ts (assertion, not a knob) | Scene & QA / Architect |
| Budget: draw calls | max 140 | draw calls | Test threshold | tests/budget.test.ts (assertion, not a knob) | Scene & QA / Architect |

Test thresholds: change only when the scene change is intended. Raising a budget needs a user decision (see the comments in tests/budget.test.ts).

## 11. Film camera (video P1)

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Film frame rate | 30 | fps | Frame rate of the recorded video | src/config/tuning/film.ts (`film.fps`) | UI & Camera |
| Manual default length | 30 | s | Length preselected in the film picker | src/config/tuning/film.ts (`film.manualDefaultSeconds`) | UI & Camera |
| Manual shortest length | 1 | s | Lower limit of the length slider | src/config/tuning/film.ts (`film.manualMinSeconds`) | UI & Camera |
| Manual longest length | 60 | s | Upper limit; the take stops by itself here | src/config/tuning/film.ts (`film.manualMaxSeconds`) | UI & Camera |
| Full HD size | 1920 x 1080 | px | Output size of the Full HD choice | src/config/tuning/film.ts (`film.width1080`, `film.height1080`) | UI & Camera |
| Video bitrate | 12,000,000 | bits per second | MediaRecorder bitrate of the recorded film (1920 x 1080 output) | src/config/tuning/film.ts (`film.videoBitrate1080`) | Scene & QA |
| Auto film audio bitrate | 192,000 | bits per second | AAC bitrate of the auto film audio track (48 kHz stereo) | src/config/tuning/film.ts (`film.audioBitrate`) | Scene & QA |
| Auto film audio peak | -3 | dBFS | Peak the auto film mix is scaled to (the overview is quiet by distance) | src/config/tuning/film.ts (`film.audioPeakTargetDb`) | Scene & QA |
| Auto film length | 60 | s | Real seconds of an auto film (57 s flight plus the perch hold) | src/config/tuning/film.ts (`film.autoSeconds`) | Scene & QA |
| Auto virtual game minutes | 60 | game min | Game minutes an auto film covers when game time runs (60 s real = 60 virtual min) | src/config/tuning/film.ts (`film.autoVirtualMinutes`) | Scene & QA |
| Auto encoder queue max | 4 | frames | Frames waiting inside the H.264 VideoEncoder before the auto film waits (memory bound) | src/config/tuning/film.ts (`film.encodeQueueMax`) | Scene & QA |
| Auto keyframe interval | 2 | s | Seconds between H.264 keyframes in the auto film (GOP = interval x fps) | src/config/tuning/film.ts (`film.keyframeIntervalS`) | Scene & QA |
| Auto sky tilt | 35 | degrees | How far the auto-film bird looks up from the horizon (sun or moon bearing). ESTIMATE, measure in P6 | src/config/tuning/film.ts (`film.skyTiltDeg`) | Scene & QA |
| Auto perch hold | 3 | s | Seconds the auto-film bird holds on the perch before the film ends | src/config/tuning/film.ts (`film.perchHoldSeconds`) | Scene & QA |
| Auto cruise clearance | 15 | m | Height above the highest roof kept by the cruise and perch flight. ESTIMATE, measure in P6 | src/config/tuning/film.ts (`film.cruiseClearanceM`) | Scene & QA |
| Auto street clearance | 3 | m | Lateral distance from building walls for the descent street choice. ESTIMATE, measure in P6 | src/config/tuning/film.ts (`film.streetClearanceM`) | Scene & QA |

## 12. House type thumbnails (House panel carousel)

| Parameter | Current value | Unit/range | What it controls | File:line (constant) | Owner |
|---|---|---|---|---|---|
| Thumbnail size | 256 | px (square) | Render size of one house type picture (about 2x the shown icon) | src/config/tuning/sceneQa.ts (`sceneQa.houseThumbs.thumbSizePx`) | Scene & QA |
| Thumbnail margin | 1.12 | factor (1 = tight) | Empty space around the house in the picture | src/config/tuning/sceneQa.ts (`sceneQa.houseThumbs.thumbMargin`) | Scene & QA |
| Thumbnail view angle | 35 | degrees | Camera angle around the house from the front (3/4 view) | src/config/tuning/sceneQa.ts (`sceneQa.houseThumbs.thumbAzimuthDeg`) | Scene & QA |
| Thumbnail view height | 18 | degrees | Camera angle above the horizon | src/config/tuning/sceneQa.ts (`sceneQa.houseThumbs.thumbElevationDeg`) | Scene & QA |
| Thumbnail field of view | 28 | degrees | Thumbnail camera vertical field of view | src/config/tuning/sceneQa.ts (`sceneQa.houseThumbs.thumbFovDeg`) | Scene & QA |
| Thumbnail key light | 3 | intensity | Warm key light of the thumbnail scene | src/config/tuning/sceneQa.ts (`sceneQa.houseThumbs.thumbKeyIntensity`) | Scene & QA |
| Thumbnail fill light | 1.6 | intensity | Sky and ground fill light of the thumbnail scene | src/config/tuning/sceneQa.ts (`sceneQa.houseThumbs.thumbFillIntensity`) | Scene & QA |

## Not yet tunable (hardcoded)

Values buried in code with no named constant or config entry. Changing them is not a one-line edit; the owner must add a constant first.

| Value | Current | File:line | Owner | Note |
|---|---|---|---|---|
| House light on/off rule | sun altitude below 0 deg | src/config/tuning/skyEnvironment.ts (`skyEnvironment.lights.lightsOnBelowDeg`) | Sky & Environment | Config now. User asked for on/off hours: the rule is altitude-driven, not clock-driven. |
| House lamp ramp | smoothstep(4, -2) on altitude | src/config/tuning/skyEnvironment.ts(`skyEnvironment.lights.houseLampsOnDeg/FullDeg`) | Sky & Environment | Config now |
| Shop light ramp | smoothstep(2, -4) on altitude | src/config/tuning/skyEnvironment.ts(`skyEnvironment.lights.shopLightsOnDeg/FullDeg`) | Sky & Environment | Config now |
| Vehicle headlight level | -altitude / 8 | src/config/tuning/skyEnvironment.ts (`skyEnvironment.lights.headlightFullDeg`) | Sky & Environment / Traffic & Life | Config now |
| Per-car headlight threshold | seeded hash, 0-1 | src/traffic/vehicleMeshes.ts:49-50 | Traffic & Life | Seeded per car; not a user value |
| Late-night window curve | 22:00 to 02:00 fade to 30%, back 04:00-06:00 | src/environment/sun.ts:186-189 | Sky & Environment | Numbers inline |
| Window lit share (default) | 0.35 | src/config/tuning/buildings.ts (`buildings.litWindowShare`) | Buildings | Config now |
| Window lit share (monuments) | 0.35 | src/config/tuning/buildings.ts (`buildings.litWindowShareMonument`) | Buildings | Config now |
| Window lit share (other) | 0.55, 0.6, 0.4 | src/config/tuning/buildings.ts (`buildings.litWindowShareGround`, `buildings.litWindowShareGroundAlt`, `buildings.litWindowShareRoof`) | Buildings | Config now |
| Pigeon, cat, squirrel, butterfly counts | 80, 14, 10, 30 | src/config/tuning/trafficLife.ts(`trafficLife.*Count`) | Traffic & Life | Config now |
| Gull count | 1 or 2 | src/life/birds.ts:528 | Traffic & Life | Literal, stays in code |
| Bee share | 0.2 | src/life/pets.ts:567 | Traffic & Life | Literal, stays in code |
| Leaf spawn fill time | 12 s | src/environment/leaves.ts:415 | Sky & Environment | Literal `/ 12`, stays in code (geometry-like timing) |
| Leaf last-second fade | 1 s | src/environment/leaves.ts:634 | Sky & Environment | Literal, stays in code |
| Cloud count in scene | 10 | src/config/tuning/skyEnvironment.ts (`skyEnvironment.clouds.sceneCount`) | Sky & Environment / Scene & QA | Config now |
| Lightning gap formula | 6 - 3.5i, 10 - 5i | src/weather/Lightning.ts:121-122 | Sky & Environment | Literal, stays in code |
| Lightning first timer | 2 + random x 3 s | src/weather/Lightning.ts:64 | Sky & Environment | Literal, stays in code |
| Weather targets per kind | rain, fog, snow cover, cloud, dim ramps | src/weather/weatherState.ts:60-106 | Sky & Environment | Per-kind literals, not named |
| Snow cover ramp | 0.25 + 0.9i | src/weather/weatherState.ts:94 | Sky & Environment | Literal, stays in code |
| Fog colours | three hex values | src/weather/fog.ts:21-23 | Sky & Environment | Literal, stays in code |
| Cricket season factor | summer 1, autumn 0.5 | src/config/tuning/audio.ts(`audio.cricketSummerDensity`, `cricketAutumnDensity`) | Audio | Config now |
| Golden phase threshold | 6 deg | src/environment/sun.ts:162 | Sky & Environment | Literal, stays in code |
| Golden glow curve | smoothstep(14,5) x smoothstep(-6,0) | src/sky/state.ts:184 | Sky & Environment | Literal, stays in code |
| Shadow far plane and normal bias | 600 m, 0.04 | src/scene/Town.tsx (literals) | Scene & QA | Literal, stays in code |
| Night bloom values | 0.5/0.15, 0.7/0.92, 0.6/0.4 | src/config/tuning/sceneQa.ts (`sceneQa.nightBloom`) | Scene & QA | Config now |
| Autumn particle colours | five hex values | src/environment/seasons.ts:153 | Sky & Environment | Literal, stays in code |
| Intensity lift on weather change | 0.15 to 0.6 | src/config/tuning/uiCamera.ts(`uiCamera.weatherLiftBelow`, `weatherLiftTo`) | UI & Camera | Config now |
| Horn concurrency | 4 | src/audio/vehicles.ts:34 (`HORN_MAX_CONCURRENT`) | Audio | Not exported, stays in code |

## Traps found while reviewing

- `TRAFFIC_DENSITY_FLOOR` (trafficDensity.ts:4) is exported but not used by `trafficDensityAt`. The curve's own 0.2 values set the floor. Now also in `trafficLife.densityFloor` (config).
- Autumn leaves rest for `LEAF_REST_SECONDS` (leaves.ts:524). The autumn profile's `groundLifetime` of 25 (seasons.ts:157) applies only to non-leaf kinds, so it is ignored for autumn leaves.
- `PINE_SHARE`, `PINE_SNOW_*` exist in config (`cityStreets`) and are re-exported by src/streets/natureTrees.ts. The lab copy src/dev/treeCompare/labNatureTrees.ts keeps its own equal values. Keep both in sync.
- `HOUSE_PRESETS` and `MONUMENT_KINDS` live in `buildings` config; store and buildings re-export them. Do not add a second list.
- `LAMP_SPACING` in src/streets/furniture.ts:126 (0.28) is a different thing from the street lamp spacing `cityStreets.streetLampSpacing` (18 m, src/config/tuning/cityStreets.ts).
- Flock `FLOCK_DEFS` has named fields but inline literals. Edit them in place.
