import React from "react";
import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import pricing from "../pricing.json"
import { HomeButton } from "../plan-buttons";
import { UserContext } from "../main";

export default function Pricing() {

    const {userId, subscriptionTier} = useContext(UserContext);
    const navigate = useNavigate()

    function handleClick() {
        if (!userId) { // user not signed in or signed up - take them to Auth screen
            toast.info('Log in or sign up to get started')
            navigate('/auth'); // note, "auth" isn't the actual route for auth screen. It uses "*", meaning any undefined route (like "auth") will route there
        }
    }

    return (
        <div className="pricing-container">

            <HomeButton />
            
            <h1>Choose Your Plan</h1>

            <div className="cards-container">
                
                {pricing.map((plan) => (
                <div
                    key={plan.id}
                    className="card"
                    style={plan.id === subscriptionTier ? {borderWidth: '5px'} : null}
                >
                    <h2>{plan.name}</h2>
                    <h3>{plan.poundsPerMonth ? `£${plan.poundsPerMonth}/month` : "Free"}</h3>
                    <ul className="features">
                        <p>Across unlimited devices:</p>
                        <li>Store up to <strong>{plan.plans} plan{plan.plans !== 1 ? "s" : ""}</strong></li>
                        <li>Pin up to <strong>{plan.items} items</strong> at a time</li>
                        <li>Attach up to <strong>{plan.images} image{plan.imagesPerItem !== 1 ? "s" : ""}</strong> at a time</li>
                        <li>Generate up to <strong>{plan.reportsPerMonth} report{plan.reportsPerMonth !== 1 ? "s" : ""}</strong> / month</li>
                        {plan.extraFeatures.length > 0 &&
                        plan.extraFeatures.map((feature, i) => (
                            <li key={i}>✨ {feature}</li>
                        ))}
                    </ul>
                    <div className="big-buttons-container">
                        <button onClick={handleClick}>
                            {plan.id === subscriptionTier ? 'Current plan' : 'Choose plan'}
                        </button>
                    </div>

                </div>
                ))}
            
            </div>
        
        </div>
    );
};
