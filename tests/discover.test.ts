import { describe, expect, it } from "vitest";
import { areasFrom, cellOf, inIndia, looksLikeTurf, toListing, type OsmElement } from "@/lib/discover";
import { normalizeState } from "@/lib/places";

describe("finding turfs on the public map", () => {
  it("keeps named turfs and drops schools, public grounds and other sports", () => {
    expect(looksLikeTurf({ name: "Crown Football Turf", leisure: "pitch", sport: "soccer" })).toBe(true);
    expect(looksLikeTurf({ name: "Golfit Premium", leisure: "pitch", sport: "football", surface: "artificial_turf" })).toBe(true);
    expect(looksLikeTurf({ name: "Impact Sports", leisure: "sports_centre", sport: "soccer;fitness" })).toBe(true);
    expect(looksLikeTurf({ name: "Club7,Pullara", leisure: "pitch", sport: "soccer" })).toBe(true);
    expect(looksLikeTurf({ leisure: "pitch", sport: "soccer" })).toBe(false); // no name
    expect(looksLikeTurf({ name: "J N V Malappuram Football Ground", leisure: "pitch", sport: "soccer" })).toBe(false);
    expect(looksLikeTurf({ name: "galaxy HS padi ground", leisure: "pitch", sport: "soccer" })).toBe(false);
    expect(looksLikeTurf({ name: "Panchayath Football Ground", leisure: "pitch", sport: "soccer" })).toBe(false);
    expect(looksLikeTurf({ name: "Quarters Badminton Court", leisure: "pitch", sport: "badminton" })).toBe(false);
    expect(looksLikeTurf({ name: "School Turf Arena", leisure: "pitch", sport: "soccer" })).toBe(true); // "turf" wins
  });

  it("turns a map feature into a listing: position, town, phone, generic names made useful", () => {
    const areas = areasFrom([
      { type: "area", id: 1, tags: { admin_level: "4", name: "Kerala" } },
      { type: "area", id: 2, tags: { admin_level: "5", name: "Malappuram" } },
      { type: "area", id: 3, tags: { admin_level: "8", name: "Manjeri" } },
    ]);
    expect(areas).toEqual({ town: "Manjeri", district: "Malappuram", state: "Kerala" });
    const way: OsmElement = { type: "way", id: 42, center: { lat: 11.1, lon: 76.1 }, tags: { name: "strikers football turf", leisure: "pitch", sport: "soccer", phone: "+91 98470 12345", lit: "yes", "addr:postcode": "676121" } };
    expect(toListing(way, areas)).toMatchObject({ ref: "way/42", name: "Strikers Football Turf", lat: 11.1, lng: 76.1, town: "Manjeri", phone: "+919847012345", pincode: "676121", amenities: ["floodlights"] });
    const generic: OsmElement = { type: "node", id: 7, lat: 11.2, lon: 76.2, tags: { name: "Turf", leisure: "pitch", sport: "soccer", "addr:suburb": "Kacherippadi" } };
    expect(toListing(generic, areas)?.name).toBe("Football Turf, Kacherippadi");
    expect(toListing({ type: "node", id: 8, tags: { name: "Kick Off", leisure: "pitch", sport: "soccer" } }, areas)).toBeNull(); // no position
    // a city tag with the area first: area becomes the locality, the town is the last part
    const tagged: OsmElement = { type: "node", id: 9, lat: 18.5, lon: 73.8, tags: { name: "Dribble Football Turf", leisure: "pitch", sport: "soccer", "addr:city": "Bavdhan, Pune" } };
    expect(toListing(tagged, areas)).toMatchObject({ town: "Pune", locality: "Bavdhan" });
    // planning regions are skipped when picking the town
    expect(areasFrom([
      { type: "area", id: 4, tags: { admin_level: "4", name: "Maharashtra" } },
      { type: "area", id: 5, tags: { admin_level: "5", name: "Pune" } },
      { type: "area", id: 7, tags: { admin_level: "7", name: "Pune Metropolitan Region" } },
    ])).toEqual({ town: "Pune", district: "Pune", state: "Maharashtra" });
    // one part of a city and development authorities are skipped too
    expect(areasFrom([
      { type: "area", id: 1, tags: { admin_level: "4", name: "Karnataka", boundary: "administrative" } },
      { type: "area", id: 2, tags: { admin_level: "5", name: "Bengaluru Urban", boundary: "administrative" } },
      { type: "area", id: 3, tags: { admin_level: "7", name: "Bangalore Metropolitan Region Development Authority", boundary: "local_authority" } },
      { type: "area", id: 4, tags: { admin_level: "7", name: "Bengaluru", boundary: "administrative" } },
      { type: "area", id: 5, tags: { admin_level: "8", name: "Bengaluru West City Corporation", boundary: "administrative" } },
    ]).town).toBe("Bengaluru");
    expect(areasFrom([{ type: "area", id: 1, tags: { admin_level: "8", name: "Kochi Municipal Corporation" } }]).town).toBe("Kochi");
  });

  it("sends only the centre of a ~10 km square, and only for India", () => {
    expect(cellOf(11.1234, 76.1987)).toEqual({ key: "11.1,76.1", lat: 11.15, lng: 76.15 });
    expect(cellOf(11.1999, 76.1001).key).toBe("11.1,76.1");
    expect(inIndia(11.12, 76.12)).toBe(true);
    expect(inIndia(28.61, 77.2)).toBe(true);
    expect(inIndia(51.5, -0.12)).toBe(false);
  });

  it("matches state names loosely", () => {
    expect(normalizeState("kerala")).toBe("Kerala");
    expect(normalizeState("Jammu & Kashmir")).toBe("Jammu and Kashmir");
    expect(normalizeState("NCT of Delhi")).toBe("Delhi");
    expect(normalizeState("")).toBeNull();
    expect(normalizeState("Bavaria")).toBeNull();
  });
});

import { photosFrom } from "@/lib/discover";
import { nearestTown, parseTile, indiaTiles } from "@/lib/import-india";
describe("photos and the India import", () => {
  it("takes real photos the map links to", () => {
    expect(photosFrom({ wikimedia_commons: "File:Kick Off Turf.jpg" })).toEqual(["https://commons.wikimedia.org/wiki/Special:FilePath/Kick_Off_Turf.jpg?width=800"]);
    expect(photosFrom({ image: "https://example.com/turf.jpg" })).toEqual(["https://example.com/turf.jpg"]);
    expect(photosFrom({ image: "https://commons.wikimedia.org/wiki/File:Arena%20One.png" })).toEqual(["https://commons.wikimedia.org/wiki/Special:FilePath/Arena_One.png?width=800"]);
    expect(photosFrom({ image: "http://insecure.example/x.jpg" })).toEqual([]); // https only
    expect(photosFrom({ image: "https://example.com/page" })).toEqual([]); // not an image
  });

  it("lists unnamed artificial football turfs, not unnamed grass pitches", () => {
    expect(looksLikeTurf({ leisure: "pitch", sport: "soccer", surface: "artificial_turf" })).toBe(true);
    expect(looksLikeTurf({ leisure: "pitch", sport: "soccer" })).toBe(false);
    expect(looksLikeTurf({ leisure: "pitch", sport: "soccer", surface: "artificial_turf", access: "private" })).toBe(false);
    expect(toListing({ type: "way", id: 5, center: { lat: 11, lon: 76 }, tags: { leisure: "pitch", sport: "soccer", surface: "artificial_turf", "addr:suburb": "Kacherippadi" } }, {})?.name).toBe("Football Turf, Kacherippadi");
  });

  it("reads towns with their state from a tile and files turfs under the nearest Indian town", () => {
    const { places, listings } = parseTile([
      { type: "way", id: 1, center: { lat: 11.12, lon: 76.12 }, tags: { name: "Crown Football Turf", leisure: "pitch", sport: "soccer" } },
      { type: "way", id: 2, center: { lat: 26.5, lon: 88.1 }, tags: { name: "Border Futsal Arena", leisure: "pitch", sport: "futsal" } },
      { type: "node", id: 10, lat: 11.12, lon: 76.11, tags: { place: "town", name: "Manjeri" } },
      { type: "area", id: 100, tags: { admin_level: "4", name: "Kerala", "ISO3166-2": "IN-KL" } },
      { type: "node", id: 11, lat: 26.5, lon: 88.12, tags: { place: "town", name: "Bhadrapur" } },
      { type: "area", id: 101, tags: { admin_level: "4", name: "Koshi Province", "ISO3166-2": "NP-P1" } },
    ]);
    expect(places).toEqual([
      { name: "Manjeri", lat: 11.12, lng: 76.11, state: "Kerala", india: true },
      { name: "Bhadrapur", lat: 26.5, lng: 88.12, state: null, india: false },
    ]);
    expect(nearestTown(listings[0], places)?.name).toBe("Manjeri");
    expect(nearestTown(listings[1], places)).toBeNull(); // nearest town is in Nepal: skipped
  });

  it("walks India in 1° tiles, nearest to Malappuram first", () => {
    const tiles = indiaTiles();
    expect(tiles[0].key).toBe("tile:11,76");
    expect(tiles.length).toBe(31 * 30);
  });
});
