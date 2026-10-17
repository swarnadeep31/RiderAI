import mongoose from 'mongoose';

// The services found along one version of a trail's route (see
// routeExtras/services.js). No document yet, with a job waiting, means
// they're still being looked for.
export const SERVICE_STATUSES = ['ready', 'failed', 'unavailable'];

const itemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['fuel', 'mechanic', 'medical', 'atm'] },
    osm: String, // OpenStreetMap id: "n123" (a point), "w456" (a building or area)
    name: String,
    brand: String,
    lat: Number,
    lng: Number,
    alongM: Number, // metres from the start of the route
    offM: Number, // metres off the route
    hours: String,
    emergency: Boolean,
    place: String, // town or village from the address, if mapped
  },
  { _id: false },
);

const gapSchema = new mongoose.Schema(
  { fromM: Number, toM: Number, lengthM: Number, afterName: String, beforeName: String },
  { _id: false },
);

const routeServicesSchema = new mongoose.Schema(
  {
    trail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail', required: true },
    routeVersion: { type: Number, required: true },
    status: { type: String, enum: SERVICE_STATUSES, required: true },
    // unavailable: why (straight lines, or switched off).
    reason: String,
    items: { type: [itemSchema], default: [] },
    // Every stretch between fuel stations, longest first.
    fuelGaps: { type: [gapSchema], default: [] },
    computedAt: Date,
    // failed: what went wrong, and when it's tried again (at most 3 times).
    error: String,
    retryAt: Date,
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

routeServicesSchema.index({ trail: 1, routeVersion: 1 }, { unique: true });

export const RouteServices = mongoose.model('RouteServices', routeServicesSchema);
