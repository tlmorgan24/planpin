from supabase import create_client
import os
from dotenv import load_dotenv
from io import BytesIO

# Create supabase client from my URL & API key in environment variables, and authenticate using JWT token (posted from front end):
def init_supabase(access_token, refresh_token):
    load_dotenv()
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_API_KEY')
    supabase = create_client(url, key)
    supabase.auth.set_session(access_token, refresh_token) # authenticate current user with JWT from front end
    return supabase

# Get marker records:
def get_marker_records(supabase, plan_id):
    response = (
        supabase.table('user_markers') # view of markers table filtered to authenticated user
        .select('id, reference, category_id, description, severity, extent')
        .eq('plan_id', plan_id) # filter to only the plan the user is generating the report for
        .is_('deleted_at', None) # where deleted_at is null (non-deleted records)
        .order('reference') # order alphabetically by reference (so that defects will appear in suitable order in report)
        .execute()
    )
    return response.data

def get_priority_marker_ids(supabase, plan_id, limit):
    response = (
        supabase.table('user_markers') # view of markers table filtered to authenticated user
        .select('id')
        .eq('plan_id', plan_id) # filter to only the plan the user is generating the report for
        .is_('deleted_at', None) # where deleted_at is null (non-deleted records)
        .order('severity', desc=True) # first level of ordering is by severity (so later limit gets most severe defects)
        .order('reference') # second level of ordering is by reference (so logically ordered wihtin each severity level)
        .limit(limit) # e.g. if limit=5, get top 5 defects based on severity
        .execute()
    )
    return [record['id'] for record in response.data]

def get_priority_marker_records(all_marker_records, priority_ids):
    return [record for record in all_marker_records if record['id'] in priority_ids]


# Get category records (note, we don't really care if categories not specific to this plan are loaded, as we don't expect the user will have many categories in total anyway):
def get_category_records(supabase):
    response = (
        supabase.table('user_categories') # view of categories table filtered to authenticated user
        .select('id, category_name, color')
        .execute()
    )
    return response.data


# Get image filenames associated with a given marker ID
def get_image_filenames(supabase, marker_id:str):
    response = (
        supabase.table('user_images') # view of images table filtered to authenticated user
        .select('image_filename')
        .eq('marker_id', marker_id)
        .is_('deleted_at', None) # where deleted_at is null (non-deleted records)
        .execute()
    )
    records = response.data
    filenames = [record['image_filename'] for record in records]
    return filenames

# Get image file:
def get_image_file(supabase, user_id:str, filename:str):
    filepath = user_id + '/img/' + filename
    response = supabase.storage.from_('user-files').download(filepath) # my bucket is called user-files
    stream = BytesIO(response) # response from .download is just bytes, not an object with .data etc properties
    return stream # this object can now be called directly in python-docx add_picture method

# Output dictionary with marker IDs as keys and their associated image files (as list of stream objects) as values
def associate_image_files(supabase, user_id:str, marker_records:list):
    dictionary = dict()
    for record in marker_records:
        marker_id = record['id']
        filenames = get_image_filenames(supabase, marker_id)
        image_files = []
        for filename in filenames:
            image_file = get_image_file(supabase, user_id, filename)
            image_files.append(image_file)
        dictionary[marker_id] = image_files
    return dictionary


# MAIN
# This is the function the script that deals with python-docx will call, getting all the data needed to generate the report easily:
# Returns:
# marker_records: list of dictionaries (one for each record or markers table)
# priority_marker_records: marker_records filtered to only the top n by severity (where n is the priority_limit input).
# marker_images: dictionary where keys are marker IDs and each value is a list of associated image objects (which can be passed directly to python-docx add_picture method) 
def get_data(access_token:str, refresh_token:str, user_id:str, plan_id:str, priority_limit:int=0):
    supabase = init_supabase(access_token, refresh_token)
    marker_records = get_marker_records(supabase, plan_id)
    marker_images = associate_image_files(supabase, user_id, marker_records)
    if not priority_limit: 
        return marker_records, [], marker_images

    # Associate category information with each marker record (for easier reference):
    category_records = get_category_records(supabase)
    updated_marker_records = []
    for marker_record in marker_records:
        category_id = marker_record['category_id']
        category_record = next((record for record in category_records if record['id'] == category_id), None)
        if category_record:
            category_name = category_record['category_name']
            color = category_record['color']
        else:
            category_name = None
            color = None
        marker_record.update({'category_name': category_name, 'color': color}) # modifies dictionary in-place
        updated_marker_records.append(marker_record)
    marker_records = updated_marker_records
        
    priority_marker_ids = get_priority_marker_ids(supabase, plan_id, priority_limit)
    priority_marker_records = get_priority_marker_records(marker_records, priority_marker_ids)

    return marker_records, priority_marker_records, marker_images
