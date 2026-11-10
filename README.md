# Catalogue map: 2017 MASTER CATALOG (Yao Han Industries)

PDF page = catalogue page + 3. The PDF has 693 pages; catalogue pages 1-690 are parts
(catalogue page 44 / PDF page 47 is a Wayken cover page and is skipped).

| File | What it is |
|---|---|
| categories.csv | The website's `categories` sheet: 5 main categories + 59 subcategories, taken from the catalogue's CONTENTS pages (category_id, name, parent_id, intro) |
| catalogue_sections.csv | Each subcategory with its catalogue pages, PDF page range, number of pictures and approximate number of part lines |
| page_map.csv | Every PDF page -> main category, subcategory, machine brand and model text from the page header ("PARTS FOR JUKI DDL-9000", "GAUGE SET FOR PEGASUS MACHINE", ...) |

Main categories (the catalogue's own groups):

1. Bag Closing Machine Parts: Newlong NP-7A, NP-3II, DS-9, DN-2HS, DD-5; Fischbein ECR/F, 100/101; Union Special 56100, 80800
2. Cutting Knives, Blades & Binders (Wayken): cloth cutting machines, straight & round knives, overlock knives, trimming blades, buttonhole knives, binders, scissors & clippers, special knives & tools, Eastman parts
3. Sewing Machine Parts by Type: loopers, knives, thread trimmers, chain cutters, vacuum waste removal, folders & binders, needle plates, feed dogs, presser feet, bobbins, bobbin cases, lights, cleaning guns, tagging guns, needles, domestic gears, household parts, accessories
4. Sewing Machine Parts by Brand: Adler, Blindstitch, Brother, Durkopp, Juki, Kansai Special, Kingtex, Lewis, Merrow, Mitsubishi, Pegasus, Pfaff, Reece, Rimoldi, Seiko, Shingling, Singer, Siruba, Union Special, Yamato
5. Cutting Machines & Parts: mini cutters, round knife cutters, straight knife cutters

Notes
- The `models` column is raw header text and needs cleaning (e.g. "NP-7A 1 4 5 6" -> "NP-7A";
  "LT2-B831,B832,B835" -> one machine per model). 52 pages have no "PARTS FOR" header
  (brochure pages, continuation pages, gauge-set tables): inherit the previous page's machine
  inside the same subcategory, or use "<Brand> (various models)".
- Size: about 9,700 pictures and ~22,000 part-number lines (including repeats), so expect
  roughly 10,000-15,000 unique parts.
