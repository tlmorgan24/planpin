from docx import Document
from docx.shared import Inches
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from get_cloud_data import get_data

def generate_report(access_token, refresh_token, user_id, plan_id, priority_limit=5, include_caption=False):

    marker_records, priority_marker_records, marker_images = get_data(access_token, refresh_token, user_id, plan_id, priority_limit)

    # Start from blank template with styles & footer defined:
    doc = Document("template.docx")
    # Template colours:
    # Primary colour: black
    # Secondary colour: #248E6B

    # Title & subtitle:
    doc.add_heading("Inspection report", level=0)
    doc.add_paragraph("This is an automatically generated inspection report", style="Subtitle")

    # Executive summary:
    doc.add_heading("Executive summary", level=1)
    doc.add_paragraph("This report documents the findings of the inspection carried out on ...")

    doc.add_heading("Highest-severity defects", level=2)


    # Full defect data:
    for record in marker_records:

        marker_id = record['id']
        images = marker_images[marker_id]

        if include_caption:
            num_rows = 4 + 2*len(images)
        else:
            num_rows = 4 + len(images)
        
        table = doc.add_table(rows=num_rows, cols=2)
        table.style = 'Table Grid'
        table.alignment = WD_TABLE_ALIGNMENT.CENTER

        header_1 = table.cell(0, 0)
        header_2 = table.cell(0, 1)
        header = header_1.merge(header_2)
        header.text = f"Defect reference: {record['reference'] or 'N/A'}"

        table.cell(1,0).text = "Category"
        table.cell(1,1).text = record['category'] or '' # if category is null, set to empty string (as setting to None object causes error)

        table.cell(2,0).text = "Description"
        table.cell(2,1).text = record['description'] or ''

        table.cell(3,0).text = "Severity"
        table.cell(3,1).text = record['severity'] or ''

        for i in range(1,4):
            left_cell = table.cell(i, 0)
            right_cell = table.cell(i, 0)
            left_cell.width = Inches(1.2)

        if len(images) == 0: continue # do not try to create image rows if there are no images; skip to the next record

        if include_caption:
            image_rows = range(4, 3 + 2*len(images)) # e.g. if 1 image, image_rows=[4]; if 2 images, image_rows=[4,6]; etc.
        else:
            image_rows = range(4, 4 + len(images))

        count = 0
        for row_index, image in zip(image_rows, images):
            image_cell1 = table.cell(row_index, 0)
            image_cell2 = table.cell(row_index, 1)
            image_cell = image_cell1.merge(image_cell2)
            paragraph = image_cell.paragraphs[0]
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER # for centred image
            run = paragraph.add_run()
            run.add_picture(images[count], width=Inches(5))
            count += 1

            if include_caption:
                caption_1 = table.cell(row_index+1, 0)
                caption_2 = table.cell(row_index+1, 1)
                caption = caption_1.merge(caption_2)
                paragraph = caption.paragraphs[0]
                paragraph.style = 'Caption'
                run = paragraph.add_run("This is a caption")

    return doc

