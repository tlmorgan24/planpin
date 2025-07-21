from supabase import create_client
import os
from dotenv import load_dotenv

# Create supabase client from my URL & service key in environment variables (service key required for account deletion):
def delete_user(user_id):
    load_dotenv()
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_KEY')
    supabase = create_client(url, key)
    supabase.auth.admin.delete_user(user_id)