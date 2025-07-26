import os
from dotenv import load_dotenv
from mailjet_rest import Client

def forward_message(name: str, email: str, message: str):

    load_dotenv()
    api_key = os.getenv("MAILJET_API_KEY")
    secret_key = os.getenv("MAILJET_SECRET_KEY")
    domain_email = os.getenv("MAILJET_EMAIL") # this is my domain email, which I have set up on Mailjet for automated sending

    mailjet = Client(auth=(api_key, secret_key), version='v3.1')
    data = {
        'Messages': [
            {
                "From": {
                    "Email": domain_email, # must send from the email address set up in Mailjet for sending (authenticated with SPF/DKIM so won't be marked as spam)
                    "Name": "PlanPin"
                },
                "To": [
                    {
                        "Email": domain_email, # I send emails back to the domain email instead of straight to me, because I have email forwarding set up on pork bun so that the emails received there will come to my personal address
                        "Name": "PlanPin"
                    }
                ],
                "Subject": f"New contact form message from {name}",
                "TextPart": f"Name: \n{name}\n\nEmail: \n{email}\n\nMessage:\n{message}",
                "ReplyTo": {
                    "Email": email,
                    "Name": name
                }
            }
        ]
    }

    result = mailjet.send.create(data=data)

    if result.status_code == 200:
        print("Email sent successfully!")
    else:
        print(f"Failed to send email: {result.status_code} - {result.json()}")
        raise Exception("Mailjet send failed")
