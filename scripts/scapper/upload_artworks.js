import fs from "fs-extra";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import { login } from "./login.js";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080/api";
const CONTENT_DIR = path.resolve("TasteMatcherTestContent");

// Helper to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to decode JWT and extract domainId
function getDomainIdFromToken(token) {
    try {
        const payload = JSON.parse(
            Buffer.from(token.split('.')[1], 'base64').toString()
        );
        return payload.domainId;
    } catch (err) {
        throw new Error(`Failed to decode token: ${err.message}`);
    }
}

async function uploadArtwork(folderPath, token, domainId) {
    const metadataPath = path.join(folderPath, "metadata.json");

    if (!(await fs.pathExists(metadataPath))) {
        console.warn(`⚠️  No metadata.json in ${folderPath}`);
        return false;
    }

    const metadata = await fs.readJson(metadataPath);

    // Find image file
    const files = await fs.readdir(folderPath);
    const imageFile = files.find(f => f.startsWith("image."));

    if (!imageFile) {
        console.warn(`⚠️  No image file in ${folderPath}`);
        return false;
    }

    const imagePath = path.join(folderPath, imageFile);

    // Prepare upload data
    const formData = new FormData();
    formData.append("file", fs.createReadStream(imagePath));
    formData.append("title", metadata.title || "");
    formData.append("artist", metadata.artist || "");
    formData.append("classification", metadata.classification || "");
    formData.append("department", metadata.department || "");
    formData.append("country", metadata.country || "");
    formData.append("date", metadata.date || "");
    formData.append("description", metadata.description || "");
    formData.append("tags", JSON.stringify(metadata.tags || []));
    formData.append("metadata", JSON.stringify(metadata));

    // Upload to API with domainId
    const res = await fetch(`${API_BASE_URL}/domains/${domainId}/uploads`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            ...formData.getHeaders(),
        },
        body: formData,
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Upload failed for ${metadata.title}: ${res.statusText} - ${errorText}`);
    }

    return true;
}

async function main() {
    try {
        // Login first
        const token = await login();

        // Extract domainId from token
        const domainId = getDomainIdFromToken(token);
        console.log(`📍 Using domain ID: ${domainId}`);

        // Get all artwork folders
        const folders = await fs.readdir(CONTENT_DIR);
        let uploadCount = 0;

        console.log(`\n📤 Starting upload of ${folders.length} artworks...\n`);

        for (const folder of folders) {
            const folderPath = path.join(CONTENT_DIR, folder);
            const stat = await fs.stat(folderPath);

            if (!stat.isDirectory()) continue;

            try {
                const success = await uploadArtwork(folderPath, token, domainId);
                if (success) {
                    uploadCount++;
                    console.log(`✅ Uploaded: ${folder} (${uploadCount}/${folders.length})`);

                    // Add delay between uploads
                    await delay(500);
                }
            } catch (err) {
                console.error(`❌ Error uploading ${folder}: ${err.message}`);
            }
        }

        console.log(`\n🎉 Upload complete! Successfully uploaded ${uploadCount} artworks.`);
    } catch (err) {
        console.error("❌ Fatal error:", err);
        process.exit(1);
    }
}

main();
