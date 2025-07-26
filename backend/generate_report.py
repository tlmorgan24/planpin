from docx import Document
from docx.shared import Inches
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from PIL import Image # installed as pip install Pillow
from get_cloud_data import get_data

def generate_report(access_token, refresh_token, user_id, plan_id, priority_limit=5, include_caption=False):

    # max dimensions of item images (inches):
    MAX_WIDTH = 5
    MAX_HEIGHT = 5

    marker_records, priority_marker_records, marker_images = get_data(access_token, refresh_token, user_id, plan_id, priority_limit)

    # Start from blank template with styles & footer defined:
    doc = Document("template.docx")
    # Template colours:
    # Primary colour: black
    # Secondary colour: #248E6B

    ## ---- Title & subtitle ----

    doc.add_heading("PlanPin report", level=0)
    doc.add_paragraph("This inspection report was generated with PlanPin", style="Subtitle")


    ## ---- Executive summary ----

    doc.add_heading("Executive summary", level=1)

    # Highest-severity items:
    doc.add_heading("Highest-severity items", level=2)

    num_priority_records = len(priority_marker_records)
    table = doc.add_table(rows=num_priority_records+1, cols=3)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    table.cell(0, 0).text = 'Item reference'
    table.cell(0, 1).text = 'Category'
    table.cell(0, 2).text = 'Severity'

    for i, record in enumerate(priority_marker_records, 1): # start enumerating at 1 instead of 0
        table.cell(i, 0).text = str(record['reference']) or '! Not provided'
        table.cell(i, 1).text = record['category_name'] or '! Not provided'
        table.cell(i, 2).text = str(record['severity']) if record['severity'] is not None else '! Not provided' # need this logic, as otherwise would return the string 'None' if None type


    # Number of defects for each category:
    doc.add_heading("Summary statistics", level=2)

    unique_categories = {record['category_name'] or '! Not provided' for record in marker_records} # set comprehension automatically ignores duplicates
    # ^ Note category_name may be null, hence these are replaced with '! Not provided' (exclamation mark meaning will appear at start of sorted list)
    categories_list = sorted(unique_categories) # list sorted alphabetically

    table = doc.add_table(rows=len(categories_list)+1, cols=3)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    table.cell(0, 0).text = 'Category'
    table.cell(0, 1).text = 'Number of items'
    table.cell(0, 2).text = 'Maximum severity'

    for i, category in enumerate(categories_list, 1): # start enumerating at 1 instead of 0
        if category == '! Not provided':
            category = None # convert category back to None (having been previously set to '! Not provided' for sorting purposes)
        table.cell(i, 0).text = category or '! Not provided'
        relevant_marker_records = [record for record in marker_records if record['category_name'] == category]
        table.cell(i, 1).text = str( len(relevant_marker_records) )
        # Note, we have to filter out null values and return a default value if iteratable is empty (otherwise, either case will cause error):
        table.cell(i, 2).text = str( max((record['severity'] for record in relevant_marker_records if record['severity'] is not None), default='! Not provided') )


    ## ---- Full item data ----

    doc.add_heading("Full item data", level=1)

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
        header.text = f"Item reference: #{record['reference'] or 'N/A'}"

        table.cell(1,0).text = "Category"
        table.cell(1,1).text = record['category_name'] or '! Not provided' # if category is null, set to "! Not provided" (note, setting to None object would cause error)
        
        table.cell(2,0).text = "Description"
        table.cell(2,1).text = record['description'] or '! Not provided'

        table.cell(3,0).text = "Severity"
        table.cell(3,1).text = str(record['severity']) if record['severity'] is not None else '! Not provided' # need this logic, as otherwise would return the string 'None' if None type

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

            # Set up image sizing:
            with Image.open(image) as img:
                width_px, height_px = img.size
                dpi = img.info.get('dpi', (72, 72))  # default DPI if not present
                width_in = width_px / dpi[0]
                height_in = height_px / dpi[1]

                # Scale down if larger than max dimensions:
                scale = min(MAX_WIDTH / width_in, MAX_HEIGHT / height_in, 1.0)
                new_width = Inches(width_in * scale)
                new_height = Inches(height_in * scale)

                # Insert:
                run.add_picture(images[count], width=new_width, height=new_height)

            count += 1

            if include_caption:
                caption_1 = table.cell(row_index+1, 0)
                caption_2 = table.cell(row_index+1, 1)
                caption = caption_1.merge(caption_2)
                paragraph = caption.paragraphs[0]
                paragraph.style = 'Caption'
                run = paragraph.add_run("This is a caption")

    return doc

