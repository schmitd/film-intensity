import { bucketizeSamples, demoFilm, demoSamples, extractIntenseMoments } from "@film-intensity/shared";

async function main() {
  const buckets = bucketizeSamples(demoSamples);
  const moments = extractIntenseMoments(buckets, 5);

  console.log(
    JSON.stringify(
      {
        filmId: demoFilm.id,
        filmTitle: demoFilm.title,
        bucketCount: buckets.length,
        topMoment: moments[0] ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("worker failed", error);
  process.exitCode = 1;
});
