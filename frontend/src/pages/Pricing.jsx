import React from "react";
import { Capacitor } from "@capacitor/core";
import { useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Purchases as NativePurchases, LOG_LEVEL, PURCHASES_ERROR_CODE } from "@revenuecat/purchases-capacitor"; // used on iOS
import { Purchases as WebPurchases } from "@revenuecat/purchases-js"; // used on web (note web SDK does not support LOG_LEVEL)
import { UserContext } from "../main";
import entitlements from "../entitlements.json";
import MenuBar from "../MenuBar";
import { checkConnection } from "../network";

export default function Pricing() {

    const {userId, subscriptionTier, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle} = useContext(UserContext);
    const navigate = useNavigate()

    async function handleClick(entitlementId) {

        // Note, we are confident user is on native mobile here, as purchase button is not shown on web (user is directed to go to app instead to change plan)

        if (!userId) { // user not signed in or signed up - take them to Auth screen
            toast.info('Log in or sign up to get started', {id: 'purchasing'});
            navigate('/auth'); // note, "auth" isn't the actual route for auth screen. It uses "*", meaning any undefined route (like "auth") will route there
            return;
        }
        if (entitlementId === subscriptionTier) {
            toast.info(<>This plan is already selected.{entitlementId === "PlanPin Starter" ? null : <> To cancel, <CancellationLink>click here</CancellationLink>.</>}</>, {id: 'purchasing'});
            return;
        }

        // If user wants to switch to the free plan, they are effectively wanting to cancel their subscription, which they must do manually at the provided link:
        if (entitlementId === "PlanPin Starter") {
            toast.info(<>To convert to the free plan, cancel your subscription by <CancellationLink>clicking here</CancellationLink>.</>, {id: 'purchasing'});
            return;
        }

        toast.loading("Purchasing plan", {id: 'purchasing'});

        const hasConnection = await checkConnection();
        if (!hasConnection) {
            toast.error('Please connect to the internet to change plan.', {id: 'purchasing'});
            return;
        }

        // Now, complete the purchase in RevenueCat
        // Note: entitlements.json has id matching the identifier assigned to the entitlement in RevenueCat, and packageId matching the identifier assigned to the package in RevenueCat
        // Also note: if user is switching plans, the process is still to buy the new plan; the old one will be cancelled automatically (i.e., no separate logic)

        const entitlement = entitlements.find(entitlement => entitlement.id === entitlementId);
        const packageId = entitlement.packageId; // matching package IDs assigned in RevenueCat
        const offerings = await NativePurchases.getOfferings();
        //const pkg = offerings.current.packageByIdentifier[packageId]; // packageByIdentifier not a valid method
        const pkg = offerings.current.availablePackages.find(p => p.identifier === packageId); // note offerings.current.availablePackages is an array of package objects, each with an identifier property

        try {
            const purchaseResult = await NativePurchases.purchasePackage({ aPackage: pkg });
            if (typeof purchaseResult.customerInfo.entitlements.active[entitlementId] !== "undefined") {      
                // Update entitlement-related variables of UserContext:
                setPurchasesContext(entitlementId, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle);
                toast.success("Plan purchased", {id: 'purchasing'});
            }
        } catch (error) {
            if (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
                toast.info("Plan purchase cancelled", {id: 'purchasing'});
            } else {
                toast.error("Something went wrong", {id: 'purchasing'});
            }
        }

    }

    return (
        <>
            <MenuBar />
            <div className="pricing-container">
                
                <h1>Choose Your Plan</h1>

                <div className="cards-container">
                    
                    {entitlements.map((entitlement) => (
                    <div
                        key={entitlement.id}
                        className="card"
                        style={entitlement.id === subscriptionTier ? {borderWidth: '5px'} : {} /* properties left as defaults defined in index.css if not current plan */}
                    >
                        <h2 style={entitlement.id === subscriptionTier ? {marginBottom: '0', paddingBottom: '0'} : {}}>
                            {entitlement.packageId}
                        </h2>
                        {entitlement.id === subscriptionTier ?
                            <p style={{marginTop: '0', paddingTop: '0', color: 'var(--inverse-accent-color)'}}>
                                (Current plan)
                            </p>
                            :
                            null
                        }
                        <h3 style={{margin: '0'}}>
                            {entitlement.poundsPerMonth ? `£${entitlement.poundsPerMonth}/month` : "Free"}
                        </h3>
                        <ul className="bullets">
                            <p>Across unlimited devices:</p>
                            <li>Store up to <strong>{entitlement.plans} plan{entitlement.plans !== 1 ? "s" : ""}</strong></li>
                            <li>Pin up to <strong>{entitlement.items} items</strong> at a time</li>
                            <li>Attach up to <strong>{entitlement.images} image{entitlement.imagesPerItem !== 1 ? "s" : ""}</strong> at a time</li>
                            {/* for now, not implemented limit on reports:
                            <li>Generate up to <strong>{entitlement.reportsPerMonth} report{entitlement.reportsPerMonth !== 1 ? "s" : ""}</strong> / month</li>
                            {entitlement.extraFeatures.length > 0 &&
                            entitlement.extraFeatures.map((feature, i) => (
                                <li key={i}>{feature}</li>
                            ))}
                            */}
                        </ul>
                        {Capacitor.getPlatform() !== 'web' ? // RevenueCat only valid on mobile app, so direct users to this if they are on web
                            <div className="big-buttons-container">
                                <button id={entitlement.id} onClick={() => handleClick(entitlement.id)} style={entitlement.id === subscriptionTier ? {backgroundColor:"var(--mid-primary-color)", cursor:"not-allowed"} : {}}> {/* if current plan, grey out button as it shouldn't be clicked, otherwise properties left as defaults defined in index.css */}
                                    {entitlement.id === subscriptionTier ? 'Current plan' : 'Choose plan'}
                                </button>
                            </div>
                        :
                            <p style={{fontWeight: 'bold'}}>
                                Manage subscriptions through the PlanPin iOS app
                            </p>
                        }

                    </div>
                    ))}
                
                </div>

                <p>
                    If these plans don't meet your needs, <Link to="/contact">get in touch</Link>.
                    {userId ? 
                        <>
                            <br/>
                            Recent change not showing? <RefreshLink setSubscriptionTier={setSubscriptionTier} setAllowedPlans={setAllowedPlans} setAllowedMarkers={setAllowedMarkers} setAllowedImages={setAllowedImages} setAllowedReportsThisBillingCycle={setAllowedReportsThisBillingCycle}>Click here</RefreshLink> to refresh.
                        </>
                        :
                        null
                    }
                </p>
            
            </div>
        </>
    );
};

// Hyperlink to open new browser window with Apple subscriptions page for user to cancel their subscription (if using href directly, it may try to open in the app webview itself instead of Safari tab):
function CancellationLink({children}) {
    return (
        <a
        href="#"
        style={{color: '#0973DC'}}
        onClick={(e) => {
            e.preventDefault(); // prevent default behaviour (would navigate to "#", meaning top of page)
            window.open("https://apps.apple.com/account/subscriptions", "_blank");
        }}
        >
            {children}
        </a>
    )
}

function RefreshLink({children, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle}) {
    return (
        <a
        href="#"
        onClick={(e) => {
            e.preventDefault(); // prevent default behaviour (would navigate to "#", meaning top of page)
            resetCustomerInfo(setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle)
        }}
        >
            {children}
        </a>
    )
}

// SET UP REVENUECAT FOR CURRENT AUTHENTICATED USER (will be executed on user sign-in, see Auth.jsx):
export async function initPurchases(userId, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle) {

    /* 
    Note internet connection required for first-time config, but then caching is done automatically.
    
    Connection check is already done in parent of initPurchases if this is a first-time sign-in, so we are 
    confident first-time config will be carried out properly.

    Apart from this, no need to throw error if no connection, as RevenueCat automatically decides whether to access
    cache or not when you try and run the config, based on if there is connection or not.
    */

    // RevenueCat Purchases and LOG_LEVEL must come from separate packages (web vs native), which I imported under separate names.
    // There is also a separate API key for web vs native.
    // NOTE: web implementation may refuse to run due to violation of content security policy if using an adblocker. Seems to work properly without adblock on chrome.
    if (Capacitor.getPlatform() !== 'web') {
        const revenueCatApiKey = import.meta.env.VITE_REVENUECAT_API_KEY;
        // Debug logging removed for production:
        //await NativePurchases.setLogLevel({ level: LOG_LEVEL.DEBUG }); // for more detailed error messages (not supported on web version). NB apparently RevenueCat automatically uses debug log level in dev builds even without this
        await NativePurchases.configure({ 
            apiKey: revenueCatApiKey,
            //appUserId: userId, // <-- DOES NOT WORK FOR CAPACITOR SDK, have to use .logIn() method below instead
        });
        await NativePurchases.logIn({ appUserID: userId });
    }
    else {
        const revenueCatApiKey = import.meta.env.VITE_REVENUECAT_WEB_API_KEY; // this is a sandbox API key, now suitable for use with real payments, but that's OK as I don't actually take payments on web (just query customer info)
        await WebPurchases.configure({ 
            apiKey: revenueCatApiKey,
            appUserId: userId,
        });
    }

    await resetCustomerInfo(setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle);

}

async function resetCustomerInfo(setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle) {

    toast.loading("Checking subscription details...", {id: 'loading'});

    // RevenueCat Purchases must come from separate packages (web vs native), which I imported under separate names (either way, assumed already configured at this point):
    let customerInfo = undefined; // info for current user
    if (Capacitor.getPlatform() !== 'web') { // on native mobile
        customerInfo = await NativePurchases.getCustomerInfo();
        customerInfo = customerInfo.customerInfo; // WEIRD QUIRK FOR CAPACITOR SDK but not web SDK: getCustomerInfo returns object with customerInfo property. THIS property has value equal to the actual customerInfo object
    }
    else { // on web
        customerInfo = await WebPurchases.getSharedInstance().getCustomerInfo(); // web SDK uses getSharedInstance, whereas Capacitor SDK does not
    }
    
    const rcEntitlements = customerInfo.entitlements.active; // active entitlements, as object keyed by entitlement "identifier" assigned in RevenueCat (which I have matched to the entitlementId in my entitlements.json).
    const entitlementKeys = Object.keys(rcEntitlements); // should be empty if no active entitlements, and have one element otherwise (as my app only has one entitlement at a time)
    let entitlementId = "PlanPin Starter"; // if user has purchased no subscription, no higher entitlement will be applied below, so they will remain on the free plan
    if (entitlementKeys.length > 0) {
        entitlementId = entitlementKeys[0]; // assuming user can only have one entitlement at a time (so array should have only one element)
    }

    setPurchasesContext(entitlementId, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle);

    toast.success(`Subscription confirmed (${entitlementId})`, {id: 'loading'});

}

function setPurchasesContext(entitlementId, setSubscriptionTier, setAllowedPlans, setAllowedMarkers, setAllowedImages, setAllowedReportsThisBillingCycle) {

    const entitlement = entitlements.find(entitlement => (entitlement.id === entitlementId)); // from entitlements.json

    setSubscriptionTier(entitlementId);
    setAllowedPlans(entitlement.plans);
    setAllowedMarkers(entitlement.items);
    setAllowedImages(entitlement.images);
    setAllowedReportsThisBillingCycle(entitlement.reportsPerMonth); // for now, all billing cycles are 1 month

}