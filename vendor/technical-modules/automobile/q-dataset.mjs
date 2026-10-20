"use strict";

export function createQDataset({dependencies={},loadDependency=null,runtime="browser"}={}) {
  const window=runtime==="browser"?dependencies:undefined; const globalThis=dependencies; const module=loadDependency?{exports:{}}:undefined; const require=loadDependency;

  // Below this many real vehicles a quadratic fit is not defensible, so the
  // graph shows the points alone rather than a curve through almost nothing.
  const MIN_CURVE_POINTS = 8;

  const LEVEL_LABELS = {
    "category-propulsion": "категорії та силової установки",
    category: "категорії"
  };

  // The coarsest displayed grouping is the vehicle group -- every M category
  // together, or every N category together. A regression is never allowed to
  // use a broader group than the scatter: otherwise the reader sees one set of
  // vehicles and a curve calculated from another.
  function groupOf(category) {
    const letter = String(category || "").charAt(0).toUpperCase();
    return letter === "M" || letter === "N" ? letter : null;
  }

  function byCategoryAndPropulsion(points, category, propulsion) {
    return points.filter(point =>
      point.category === category && point.propulsion === propulsion);
  }

  function byCategory(points, category) {
    return points.filter(point => point.category === category);
  }

  function byGroup(points, category) {
    const group = groupOf(category);
    return group ? points.filter(point => groupOf(point.category) === group) : [];
  }

  // MIN_CURVE_POINTS exists to stop a curve being fitted through too little
  // evidence. Counting ROWS lets duplicate vehicles clear it on their own:
  // e.g. 7 Gazelle body variants that all state the identical 2440/3375 kg
  // curb/gross pair are one physical data point drawn seven times, and 12
  // ПАЗ-3205 trims transcribed from one handbook page are the family's one
  // mass reading, not 12 independent measurements. Definition used here: two
  // points with an identical (curbMass, grossMass) pair are one piece of
  // evidence, however many trim rows state it.
  function distinctEvidenceCount(points) {
    const seen = new Set();
    for (const point of points) seen.add(`${point.curbMass}|${point.grossMass}`);
    return seen.size;
  }

  function select(points, { category, propulsion } = {}) {
    const all = Array.isArray(points) ? points : [];
    const specific = byCategoryAndPropulsion(all, category, propulsion);
    const categoryPoints = byCategory(all, category);
    const groupPoints = byGroup(all, category);

    const [scatterLevel, scatter] = specific.length
      ? ["category-propulsion", specific]
      : (categoryPoints.length
          ? ["category", categoryPoints]
          : ["group", groupPoints]);
    const canFit = distinctEvidenceCount(scatter) >= MIN_CURVE_POINTS;

    return {
      scatter,
      curve: canFit ? scatter : null,
      level: canFit ? scatterLevel : null,
      group: groupOf(category),
      count: scatter.length
    };
  }

  function levelLabel(level, group) {
    if (level === "group") {
      return group
        ? `усіх категорій групи ${group}`
        : "усіх категорій своєї групи";
    }
    return LEVEL_LABELS[level] || "недостатньо даних для регресії";
  }

  return { MIN_CURVE_POINTS, groupOf, distinctEvidenceCount, select, levelLabel };
}
