const { prePullDockerImages } = require("../evaluation/dockerRunner");

async function run() {
  const result = await prePullDockerImages();

  if (!result.ok) {
    console.error("Docker image pre-pull failed", result.error || "unknown error");
    process.exit(1);
  }

  console.log(`Docker image pre-pull completed for ${result.images.length} images`);
}

run().catch((error) => {
  console.error("Docker image pre-pull crashed", error);
  process.exit(1);
});
