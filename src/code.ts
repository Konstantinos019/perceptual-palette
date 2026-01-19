/// <reference types="@figma/plugin-typings" />
import type { FigmaExportPayload } from './types';
import { figmaRgbToHex } from './colorLogic';

figma.showUI(__html__, { width: 525, height: 900, themeColors: true });

// Sync with selection on launch is the ONLY "smart" thing code.ts does now
// And even this could be refactored, but it's fine here as an input mechanism.
function syncSelectionOnLaunch() {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
        const node = selection[0];
        if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
            const fill = node.fills[0];
            if (fill.type === 'SOLID') {
                const hex = figmaRgbToHex(fill.color);
                figma.ui.postMessage({ type: 'SET_BASE_COLOR', hex });
            }
        }
    }
}
syncSelectionOnLaunch();

figma.ui.onmessage = async (msg) => {
    if (msg.type === 'CLOSE_PLUGIN') {
        figma.closePlugin();
    } else if (msg.type === 'NOTIFY') {
        figma.notify(msg.message || 'Action completed');
    } else if (msg.type === 'RESIZE_UI') {
        figma.ui.resize(msg.width || 525, msg.height);
    } else if (msg.type === 'GET_PALETTES') {
        // Phase 1 + 3: Read existing palettes data using helper
        await sendPalettesToUI();
    } else if (msg.type === 'EXPORT_TO_FIGMA') {
        const payload = msg.payload as FigmaExportPayload;

        // V 0.0.80: Handle "Save Changes" (Update Mode)
        if (payload.action === 'update' && payload.paletteId) {
            await updatePaletteVariables(payload);
            await sendPalettesToUI();
            figma.notify(`Updated ${payload.name} variables`);
            return;
        }

        // Default: Create Mode (Frame Generation + Optional Variables)
        const { name: baseColorName, swatches, createVariables = false, createFrame = true } = payload;

        // DEBUG: Confirm we received the request to create variables
        if (createVariables) {
            console.log("Debug: createVariables is TRUE");
        } else {
            console.log("Debug: createVariables is FALSE or Undefined");
        }

        if (!isValidPayload(payload)) {
            figma.notify('Error: Invalid palette data received');
            return;
        }

        // Load fonts needed for labels
        await Promise.all([
            figma.loadFontAsync({ family: "Inter", style: "Medium" }),
            figma.loadFontAsync({ family: "Inter", style: "Bold" }),
            figma.loadFontAsync({ family: "Inter", style: "Regular" })
        ]);

        // 1. Create Main Outer Frame (Optional)
        let container: FrameNode | null = null;
        if (createFrame) {
            container = figma.createFrame();
            container.name = baseColorName; // Use pre-calculated name
            container.layoutMode = "HORIZONTAL";
            container.paddingLeft = container.paddingRight = 40;
            container.paddingTop = container.paddingBottom = 40;
            container.itemSpacing = 12;
            container.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
            container.cornerRadius = 8;
            container.primaryAxisSizingMode = "AUTO";
            container.counterAxisSizingMode = "AUTO";
            container.counterAxisAlignItems = "CENTER";
        }

        // 2. Setup Variable Collection (Restored to [primitive] colors)
        let collection: VariableCollection | null = null;
        let varPaletteName = baseColorName;

        if (createVariables) {
            try {
                // Modified: Case insensitive match for creating/finding collection
                const collectionName = "[primitive] colors";
                console.log("Debug: Fetching collections...");
                const collections = await figma.variables.getLocalVariableCollectionsAsync();
                console.log("Debug: Found collections:", collections.map(c => c.name));

                collection = collections.find(c => c.name.toLowerCase() === collectionName) || figma.variables.createVariableCollection(collectionName);
                console.log("Debug: Target collection:", collection.id, collection.name);

                // Name collision check
                const allVariables = await figma.variables.getLocalVariablesAsync('COLOR');
                const existingVars = allVariables.filter(v => v.variableCollectionId === collection!.id);

                let counter = 1;
                while (existingVars.some(v => v.name.startsWith(`${varPaletteName}/`))) {
                    varPaletteName = `${baseColorName} ${counter}`;
                    counter++;
                }
            } catch (error: any) {
                console.error("Failed to access variables:", error);
                figma.notify(`Error creating tokens: ${error.message || error}`, { error: true });
                // We don't return here, we allow the visual palette to still be generated
            }
        }

        // 3. Draw Loop using PRE-CALCULATED swatches (Restored Layout)
        for (const swatch of swatches) {
            const figmaColor = { r: swatch.color.r, g: swatch.color.g, b: swatch.color.b };

            // Create Visual Card if Frame is enabled
            if (container) {
                // Create the Card Frame
                const card = figma.createFrame();
                card.name = `${swatch.stop}`;
                card.layoutMode = "VERTICAL";
                card.itemSpacing = 8;
                card.fills = [];
                card.counterAxisSizingMode = "AUTO";
                card.primaryAxisSizingMode = "AUTO";

                // Color block
                // Backup used createFrame, so we restore that exactly to be safe and "legacy compliant"
                const colorBlockShape = figma.createFrame();
                colorBlockShape.name = `${swatch.stop}`;
                colorBlockShape.resize(124, 96);
                colorBlockShape.cornerRadius = 11;
                colorBlockShape.fills = [{ type: 'SOLID', color: figmaColor }];
                card.appendChild(colorBlockShape);

                // Details frame
                const details = figma.createFrame();
                details.name = "details";
                details.layoutMode = "VERTICAL";
                details.itemSpacing = 0;
                details.fills = [];
                details.counterAxisSizingMode = "AUTO";
                details.primaryAxisSizingMode = "AUTO";

                // Stop label
                const stopText = figma.createText();
                stopText.fontName = { family: "Inter", style: "Bold" };
                stopText.characters = `${swatch.stop}`;
                stopText.fontSize = 16;
                stopText.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
                details.appendChild(stopText);

                // Hex label
                const hexText = figma.createText();
                hexText.fontName = { family: "Inter", style: "Regular" };
                hexText.characters = swatch.hex.toUpperCase();
                hexText.fontSize = 16;
                hexText.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
                details.appendChild(hexText);

                // Contrast frame
                const contrastFrame = figma.createFrame();
                contrastFrame.name = "contrast";
                contrastFrame.layoutMode = "HORIZONTAL";
                contrastFrame.itemSpacing = 4;
                contrastFrame.fills = [];
                contrastFrame.counterAxisAlignItems = "CENTER";
                contrastFrame.primaryAxisSizingMode = "AUTO";
                contrastFrame.counterAxisSizingMode = "AUTO";

                const contrastValue = swatch.contrast;
                const isPass = swatch.isPass;
                const statusColor = isPass ? { r: 0, g: 0.53, b: 0.1 } : { r: 1, g: 0, b: 0 };

                // Icon
                const iconText = figma.createText();
                iconText.fontName = { family: "Inter", style: "Regular" };
                iconText.characters = isPass ? "✓" : "⚠";
                iconText.fontSize = 16;
                iconText.fills = [{ type: 'SOLID', color: statusColor }];
                contrastFrame.appendChild(iconText);

                const ratioText = figma.createText();
                ratioText.fontName = { family: "Inter", style: "Regular" };
                ratioText.characters = `${contrastValue.toFixed(2)}:1`;
                ratioText.fontSize = 16;
                ratioText.fills = [{ type: 'SOLID', color: statusColor }];
                contrastFrame.appendChild(ratioText);

                details.appendChild(contrastFrame);
                card.appendChild(details);
                container.appendChild(card);
            }

            // 4. Create Variable or Bind if Variable Exists
            if (createVariables && collection) {
                try {
                    const varName = `${varPaletteName}/${swatch.stop}`;
                    // Fixed: Pass collection object, not ID
                    const variable = figma.variables.createVariable(varName, collection, 'COLOR');
                    variable.setValueForMode(collection.modes[0].modeId, figmaColor);

                } catch (e: any) {
                    console.error(`Failed to create variable ${swatch.stop}:`, e);
                    figma.notify(`Failed to create token for ${swatch.stop}: ${e.message}`, { error: true });
                }
            }
        }

        if (container) {
            figma.currentPage.appendChild(container);

            // 5. Positioning logic (Restored from Backup - Collision Detection)
            let targetX = 0;
            let targetY = 0;
            const paletteWidth = container.width;
            const paletteHeight = container.height;

            const selection = figma.currentPage.selection;
            if (selection.length > 0) {
                // Find the bounding box of current selection to place below it
                let minX = Infinity;
                let maxY = -Infinity;
                for (const node of selection) {
                    // Safe cast for bounds
                    const bounds = (node as any).absoluteRenderBounds;
                    if (bounds) {
                        if (bounds.x < minX) minX = bounds.x;
                        const bottomY = bounds.y + bounds.height;
                        if (bottomY > maxY) maxY = bottomY;
                    }
                }
                if (minX !== Infinity && maxY !== -Infinity) {
                    targetX = minX;
                    targetY = maxY + 80; // Generous gap from backup
                } else {
                    const center = figma.viewport.center;
                    targetX = center.x - paletteWidth / 2;
                    targetY = center.y - paletteHeight / 2;
                }
            } else {
                const center = figma.viewport.center;
                targetX = center.x - paletteWidth / 2;
                targetY = center.y - paletteHeight / 2;
            }

            // Robust Collision detection using absoluteRenderBounds
            const potentialColliders = figma.currentPage.findAll(n =>
                n.id !== container.id &&
                'absoluteRenderBounds' in n &&
                (n as any).absoluteRenderBounds !== null &&
                n.visible
            );

            let foundSpace = false;
            let attempts = 0;
            const stepSize = 120;

            while (!foundSpace && attempts < 50) {
                let collision = false;
                const currentBounds = {
                    x: targetX,
                    y: targetY,
                    width: paletteWidth,
                    height: paletteHeight
                };

                for (const node of potentialColliders) {
                    const other = (node as any).absoluteRenderBounds;
                    if (!other) continue;

                    const overlapX = currentBounds.x < other.x + other.width && currentBounds.x + currentBounds.width > other.x;
                    const overlapY = currentBounds.y < other.y + other.height && currentBounds.y + currentBounds.height > other.y;

                    if (overlapX && overlapY) {
                        collision = true;
                        break;
                    }
                }

                if (collision) {
                    targetY += stepSize;
                    attempts++;
                } else {
                    foundSpace = true;
                }
            }

            container.x = targetX;
            container.y = targetY;

            // 6. Finalize: Select and Zoom
            figma.currentPage.selection = [container];
            figma.viewport.scrollAndZoomIntoView([container]);
        }

        // Refresh palettes after creation (Recent Logic)
        if (createVariables) {
            await sendPalettesToUI();
            figma.notify('Variables created successfully!');
        } else if (createFrame) {
            figma.notify('Visual palette created successfully!');
        }
    }
};


/**
 * Helper to get all palettes formatted for UI
 * V 0.0.86 Deep Dive + Flexible Parsing
 */
async function getPalettesData() {
    try {
        const allVariables = await figma.variables.getLocalVariablesAsync('COLOR');
        const allCollections = await figma.variables.getLocalVariableCollectionsAsync();

        // DIAGNOSTIC LOGGING
        const collectionNames = allCollections.map(c => c.name);
        const sampleVarNames = allVariables.slice(0, 3).map(v => v.name);

        console.log("Deep Dive: Accessing Local Variables...");
        console.log("Deep Dive: Found Collections:", collectionNames);
        console.log("Deep Dive: Total Color Variables:", allVariables.length);
        console.log("Deep Dive: Sample Variable Names:", sampleVarNames);

        if (allCollections.length === 0) {
            console.warn("Deep Dive: No variable collections found in document.");
            return [];
        }

        // Notify user of what we see (Enhanced Diagnostic)
        figma.notify(`Diagnostics: found ${allCollections.length} collections. Vars: ${allVariables.length}. Examples: ${sampleVarNames.join(', ')}`);

        const paletteMap: Record<string, { hueName: string, stops: { stop: number, hex: string, variableId: string }[] }> = {};

        for (const variable of allVariables) {
            // RELAXED FILTER: Look at ALL collections
            // FLEXIBLE PARSING: Try '/', '-', ' '
            let parts = variable.name.split('/');
            let separator = '/';

            // Try other separators if split failed
            if (parts.length < 2) {
                parts = variable.name.split('-');
                separator = '-';
            }
            if (parts.length < 2) {
                parts = variable.name.split(' ');
                separator = ' ';
            }

            if (parts.length >= 2) {
                const stopStr = parts[parts.length - 1];
                const stop = parseInt(stopStr, 10);

                if (!isNaN(stop)) {
                    let groupName = "";

                    if (separator === '/' && parts.length > 2) {
                        // Standard structure: Collection/Group/Name -> Use "Group"
                        groupName = parts[parts.length - 2];
                    } else {
                        // Flat (Slate-500) or Short (Slate/500) -> Use first part
                        groupName = parts.slice(0, parts.length - 1).join(separator);
                    }

                    if (!paletteMap[groupName]) {
                        paletteMap[groupName] = { hueName: groupName, stops: [] };
                    }

                    const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
                    if (collection && collection.modes.length > 0) {
                        const modeId = collection.modes[0].modeId;
                        const value = variable.valuesByMode[modeId];

                        const rgb = resolveColor(value);
                        if (rgb) {
                            const hex = figmaRgbToHex(rgb);
                            // Avoid duplicates if multiple modes resolve differently? 
                            // We just take the first mode for this visualization.
                            paletteMap[groupName].stops.push({ stop, hex, variableId: variable.id });
                        }
                    }
                }
            }
        }

        const foundPalettes = Object.values(paletteMap);
        console.log("Deep Dive: Resolved Palettes:", foundPalettes.length, foundPalettes.map(p => p.hueName));

        return foundPalettes.map(p => {
            p.stops.sort((a, b) => a.stop - b.stop);
            // Find 500 or nearest center for preview
            let previewStop = p.stops.find(s => s.stop === 500);
            if (!previewStop && p.stops.length > 0) {
                previewStop = p.stops[Math.floor(p.stops.length / 2)];
            }
            return { hueName: p.hueName, previewHex: previewStop?.hex || '#888888', stops: p.stops };
        });
    } catch (error: any) {
        console.error("Error in getPalettesData:", error);
        figma.notify(`Deep Dive Error: ${error.message}`);
        return [];
    }
}

/**
 * Recursively resolves a variable value to an RGB color.
 * Handles explicit RGB values and VariableAlias (references).
 */
function resolveColor(value: VariableValue, depth = 0): RGB | null {
    if (depth > 10) return null; // Prevent infinite recursion

    if (value && typeof value === 'object') {
        if ('r' in value && 'g' in value && 'b' in value) {
            return value as RGB;
        }

        if ('type' in value && value.type === 'VARIABLE_ALIAS') {
            const alias = value as VariableAlias;
            const resolvedVar = figma.variables.getVariableById(alias.id);
            if (resolvedVar) {
                // For simplicity in this context, we try to grab the value from the first mode 
                // of the resolved variable's collection, as we don't have a specific mode context passed down for the target.
                // In a more complex multi-mode setup, we might need more logic here.
                const collection = figma.variables.getVariableCollectionById(resolvedVar.variableCollectionId);
                if (collection && collection.modes.length > 0) {
                    const modeId = collection.modes[0].modeId;
                    return resolveColor(resolvedVar.valuesByMode[modeId], depth + 1);
                }
            }
        }
    }
    return null;
}

/**
 * Sends the current list of palettes to the UI
 */
async function sendPalettesToUI() {
    try {
        const palettes = await getPalettesData();
        figma.ui.postMessage({ type: 'PALETTES_DATA', palettes });
    } catch (error) {
        console.error("Error sending palettes to UI:", error);
    }
}

/**
 * Updates existing variables for a palette (V 0.0.80) (Preserved)
 */
async function updatePaletteVariables(payload: FigmaExportPayload) {
    const { paletteId, swatches } = payload;
    if (!paletteId) return;

    try {
        // 1. Get/Create Target Collection
        const collectionName = "[primitive] colors";
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        let collection = collections.find(c => c.name.toLowerCase() === collectionName);

        if (!collection) {
            collection = figma.variables.createVariableCollection(collectionName);
        }

        const collectionId = collection.id;
        const modeId = collection.modes[0].modeId;

        // 2. Get existing variables strictly from this collection
        const allVariables = await figma.variables.getLocalVariablesAsync('COLOR');
        const paletteVariables = allVariables.filter(v =>
            v.variableCollectionId === collectionId &&
            v.name.startsWith(paletteId + '/')
        );

        // 2. Loop through payload swatches and update/create
        for (const swatch of swatches) {
            const varName = `${paletteId}/${swatch.stop}`;
            const existingVar = paletteVariables.find(v => v.name === varName);
            const figmaColor = { r: swatch.color.r, g: swatch.color.g, b: swatch.color.b };

            if (existingVar) {
                existingVar.setValueForMode(modeId, figmaColor);
            } else {
                const newVar = figma.variables.createVariable(varName, collection, 'COLOR');
                newVar.setValueForMode(modeId, figmaColor);
            }
        }

        // 3. Strict Sync: Remove variables that are no longer in the payload
        const newStopNames = swatches.map(s => `${paletteId}/${s.stop}`);
        for (const v of paletteVariables) {
            if (!newStopNames.includes(v.name)) {
                v.remove();
            }
        }
    } catch (error: any) {
        console.error("Failed to update variables:", error);
        figma.notify(`Error updating tokens: ${error.message || error}`, { error: true });
        throw error; // Re-throw to stop subsequent logic if needed
    }
}


function isValidPayload(payload: any): payload is FigmaExportPayload {
    return payload
        && typeof payload === 'object'
        && Array.isArray(payload.swatches)
        && typeof payload.name === 'string'
        && (typeof payload.createVariables === 'boolean' || payload.createVariables === undefined);
}
