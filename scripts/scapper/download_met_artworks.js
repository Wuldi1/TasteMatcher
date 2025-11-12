import fs from "fs-extra";
import path from "path";
import fetch from "node-fetch";

const BASE_DIR = path.resolve("TasteMatcherTestContent");
await fs.ensureDir(BASE_DIR);

// Helper to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to shuffle array (Fisher-Yates)
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function main() {
  console.log("🎨 Fetching artwork IDs from The Met API...");
  
  // Define diverse search queries for different content types
  const searchQueries = [
    { query: "painting", label: "Paintings" },
    // { query: "landscape", label: "Landscapes" },
    // { query: "nature", label: "Nature" },
    // { query: "modern art", label: "Modern Art" },
    // { query: "sculpture", label: "Sculptures" },
    // { query: "photography", label: "Photography" },
    // { query: "abstract", label: "Abstract Art" },
    // { query: "portrait", label: "Portraits" },
    // { query: "flowers", label: "Flowers" },
    // { query: "architecture", label: "Architecture" },
  ];

  let allIds = [];

  // Fetch IDs from each category
  for (const { query, label } of searchQueries) {
    try {
      console.log(`📂 Fetching ${label}...`);
      const searchRes = await fetch(
        `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`
      );
      const { objectIDs } = await searchRes.json();
      
      if (objectIDs?.length) {
        // Take up to 100 from each category
        const categoryIds = shuffleArray(objectIDs).slice(0, 100);
        allIds.push(...categoryIds);
        console.log(`   Found ${objectIDs.length} total, selected ${categoryIds.length}`);
      }
      
      // Small delay between search queries
      await delay(1000);
    } catch (err) {
      console.warn(`⚠️ Error fetching ${label}: ${err.message}`);
    }
  }

  // Remove duplicates and shuffle
  allIds = shuffleArray([...new Set(allIds)]);
  console.log(`\n✨ Total unique artworks to download: ${allIds.length}`);

  // Limit to 1000 total
  const ids = allIds.slice(0, 1000);
  let count = 0;

  for (const id of ids) {
    try {
      const res = await fetch(
        `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`
      );
      const data = await res.json();
      if (!data.primaryImageSmall) continue;

      // Clean and normalize folder name
      let folderName =
        (data.title || `artwork_${id}`)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
      const artDir = path.join(BASE_DIR, folderName);
      
      // Skip if already exists
      if (await fs.pathExists(path.join(artDir, "metadata.json"))) {
        console.log(`⏭️  Skipping existing artwork: ${folderName}`);
        continue;
      }

      await fs.ensureDir(artDir);

      // Determine file extension
      const url = data.primaryImageSmall;
      const ext = path.extname(new URL(url).pathname).toLowerCase() || ".jpg";
      const imgFile = path.join(artDir, `image${ext}`);

      // Download image
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error(`Failed image download ${id}`);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      await fs.writeFile(imgFile, buffer);

      // Write metadata
      const metadata = {
        id: data.objectID,
        title: data.title,
        artist: data.artistDisplayName,
        date: data.objectDate,
        culture: data.culture,
        medium: data.medium,
        dimensions: data.dimensions,
        classification: data.classification,
        department: data.department,
        country: data.country,
        imageLocalPath: imgFile,
        imageURL: data.primaryImageSmall,
        objectURL: data.objectURL,
        source: "The Metropolitan Museum of Art (Open Access)",
        license: "CC0 (Public Domain)",
        downloadTimestamp: new Date().toISOString(),
      };
      await fs.writeJson(path.join(artDir, "metadata.json"), metadata, {
        spaces: 2,
      });

      count++;
      if (count % 50 === 0) {
        console.log(`✅ Processed ${count} artworks...`);
        console.log("⏸️  Waiting 5 seconds before next batch...");
        await delay(5000); // Wait 5 seconds between batches
      }
    } catch (err) {
      console.warn(`⚠️ Error on ID ${id}: ${err.message}`);
      continue;
    }
  }

  console.log(`🎉 Done! Saved ${count} artworks in ${BASE_DIR}`);
}

main().catch((err) => console.error("❌ Fatal error:", err));
