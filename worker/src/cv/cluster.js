// Groups crops that look alike, so instead of scrolling through thousands of
// frames the user only labels one picture per group ("this one is gear 3").
import { matchScore } from './match.js';

export class Clusterer {
  constructor(size, { threshold, maxShift, maxClusters = 40 }) {
    this.size = size;
    this.threshold = threshold;
    this.maxShift = maxShift;
    this.maxClusters = maxClusters;
    this.clusters = [];
    this.last = null;
  }

  similarity(pixels, cluster) {
    return matchScore(pixels, cluster.pixels, this.size.w, this.size.h, this.maxShift);
  }

  add({ time, pixels }) {
    // Consecutive frames usually show the same gear, so try the last group first.
    let match = null;
    if (this.last && this.similarity(pixels, this.last) >= this.threshold) {
      match = this.last;
    } else {
      let bestScore = -Infinity;
      for (const cluster of this.clusters) {
        const score = this.similarity(pixels, cluster);
        if (score > bestScore) {
          bestScore = score;
          match = cluster;
        }
      }
      if (bestScore < this.threshold) match = null;
    }

    if (match) {
      match.count += 1;
      match.lastSeen = time;
    } else if (this.clusters.length < this.maxClusters) {
      // The first crop of a group becomes the picture the user labels.
      match = { pixels, count: 1, firstSeen: time, lastSeen: time };
      this.clusters.push(match);
    }
    if (match) this.last = match;
  }
}
