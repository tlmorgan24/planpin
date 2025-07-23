import { useContext, useState, useEffect } from "react";
import Modal from 'react-modal';
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { UserContext } from "./main";
import { DbContext } from "./main";
import { AppContext } from "./App";

// Get category options user has created, from categories table of database:
async function refreshCategories(db, supabase, userId, setCategoryOptionsData) {

    if (Capacitor.getPlatform() !== 'web') { // on mobile
        const categoriesResult = await db.query(
            `
                SELECT id, category_name, color
                FROM categories
                WHERE user_id = ?
                    AND deleted_at IS NULL
            `, 
            [userId]
        );
        if (categoriesResult.values.length > 0) {
            setCategoryOptionsData(categoriesResult.values);
        }
    }

    else { // on web
        const { data, error } = await supabase
            .from('user_categories')
            .select('id, category_name, color')
            .eq('user_id', userId)
            .is('deleted_at', null);
        if (error) console.error('Error: ', error);
        if (data.length > 0) {
            setCategoryOptionsData(data);
        }
    }

}

export function ManageCategoriesButton() {

    const {setCategoriesOpen} = useContext(AppContext);

    function handleClick() {
        setCategoriesOpen(true);
    }

    return (
        <button type="button" onClick={handleClick}>Manage</button>
    )
}

/*
This modal provides two modals in one:
* First modal: - for all categories, allowing user to select one to edit or click "add" a new one
* Second modal: - opened after clicking button in first modal. Allows user to edit properties of the selected/new category
*/
export function CategoriesModal() {

    const {userId} = useContext(UserContext);
    const {db, supabase} = useContext(DbContext);
    const {categoriesOpen, setCategoriesOpen, categoryOptionsData, setCategoryOptionsData} = useContext(AppContext);
    
    const [categoryOpen, setCategoryOpen] = useState(false); // second modal, for a specific category, opened on button click to add/edit the category
    const [categoryId, setCategoryId] = useState(null); // ID to pass to single-category modal on button click (will pass null if adding new category)

    // Refresh on start-up (NOT on change of categoryOptionsData, because this is updated much more efficiently when user edits/adds category, and is tracked by the useContext here to monitor that change):
    useEffect(() => {
        async function func() {
            await refreshCategories(db, supabase, userId, setCategoryOptionsData);
        }
        func();
    }, [])

    function openCategory(categoryId) {
        setCategoryId(categoryId);
        setCategoryOpen(true); // open single-category modal
    }

    function addCategory() {
        setCategoryId(null); // having "categoryId === null" signals to single-category modal that it should ADD a new category
        setCategoryOpen(true); // open single-category modal
    }

    function closeModal() {
        setCategoriesOpen(false);
    }

    return (
        <>
            {/* First modal - for all categories, allowing user to select one to edit or add a new one (given z-index above marker FormModal, but below single-category modal): */}
            <Modal 
                className={{base: 'centre-modal', afterOpen: 'after-open', beforeClose: 'before-close'}} 
                closeTimeoutMS={300} 
                isOpen={categoriesOpen} 
                onRequestClose={closeModal} 
                style={{
                    overlay: { zIndex: 1100 },
                    content: { zIndex: 1101 }
                }}
            >
                <h2>Edit category</h2>
                <div className="big-buttons-container" >
                    {categoryOptionsData.map(category => (
                        <button key={category.id} type="button" onClick={() => {openCategory(category.id)}}>
                            {category.category_name} {/* could further improve to show category colour here */}
                        </button>
                    ))}
                </div>
                <h2>Other actions</h2>
                <div className="big-buttons-container">
                    <button type="button" className="accented" onClick={addCategory}>Add category</button>
                    <button type="button" onClick={closeModal}>Close</button>
                </div>
            </Modal>
            {/* Second modal - for a single category, allowing user to edit (given z-index above first modal): */}
            <CategoryModal 
                isOpen={categoryOpen} 
                setIsOpen={setCategoryOpen} 
                categoryId={categoryId} 
                setCategoryOptionsData={setCategoryOptionsData} 
            />
        </>
    )
}




// If categoryId is not passed to this modal, we will create a new category, otherwise we will edit the existing category associated with that ID:
function CategoryModal({ isOpen, setIsOpen, categoryId, setCategoryOptionsData }) {

    const {userId} = useContext(UserContext);
    const {db, supabase} = useContext(DbContext);
    const [formValues, setFormValues] = useState({category_name: '', color: ''});

    // Set form values (category name and color) to current database data (if categoryId parameter is passed)
    useEffect(() => {
        async function func() {

            if (!isOpen) return; // only run when modal opens (we are using isOpen as a dep, so will refresh even if re-opening modal with same categoryId)

            // If creating new category, ensure form values reset to empty (in case may have been re-opened with stale values):
            if (!categoryId) {
                setFormValues({ category_name: '', color: '' });
                return;
            }
            
            let row = null;
            if (Capacitor.getPlatform() !== 'web') { // on mobile
                const categoriesResult = await db.query(
                    `
                        SELECT category_name, color
                        FROM categories
                        WHERE id = ? 
                    `, 
                    [categoryId]
                );
                row = categoriesResult.values[0];
            }
            else { // on web
                const {data, error} = await supabase
                    .from('categories')
                    .select('category_name, color')
                    .eq('id', categoryId);
                if (error) console.error(error);
                row = data[0];
            }

            setFormValues(row);

        }
        func();
    }, [categoryId, isOpen]);

    function closeModal() {
        setIsOpen(false);
    }

    async function handleSubmit(e) {

        e.preventDefault();

        let existing = true;
        if (!categoryId) {
            existing = false;
            categoryId = crypto.randomUUID(); // Generate new random UUID for new category, so there will be no primary key conflict (the try/catch below is just to catch generic unexpected errors)
        }

        try {

            if (Capacitor.getPlatform() !== 'web') { // on mobile
                await db.run(
                    `
                        INSERT INTO categories (id, category_name, user_id, color, created_at, updated_at) 
                        VALUES (?, ?, ?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'), STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
                        ON CONFLICT(id) DO UPDATE SET
                            color = excluded.color,
                            updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                    `,
                    [categoryId, formValues.category_name, userId, formValues.color]
                );
            }

            else { // on web
                const {error} = await supabase
                    .from('categories')
                    .upsert(
                        {
                            id: categoryId,
                            category_name: formValues.category_name,
                            user_id: userId,
                            color: formValues.color,
                            updated_at: new Date().toISOString(),
                            // no need for created_at, as supabase makes this default to now anyway if it is a new record
                        },
                        {onConflict: 'id'}
                    ); 
                if (error) throw error;
            }

            if (!existing) { // append new entry to categoryOptionsData:
                setCategoryOptionsData(prev => [...prev, {id: categoryId, category_name: formValues.category_name, color: formValues.color}]);
            }
            else { // edit existing entry of categoryOptionsData:
                setCategoryOptionsData(prev => prev.map(category => 
                    category.id === categoryId 
                        ? { ...category, category_name: formValues.category_name, color: formValues.color } 
                        : category
                ));
            }
            closeModal();

        } catch (error) {
            console.error(error);
            toast.error("Something went wrong")
            // leave modal open
        }

    }

    function handleFormChange(event) {
        const { name, value } = event.target;
        setFormValues((prevState) => ({ ...prevState, [name]: value }));
    };

    return (
        <Modal 
            className={{base: 'centre-modal', afterOpen: 'after-open', beforeClose: 'before-close'}} 
            closeTimeoutMS={300} 
            isOpen={isOpen} 
            onRequestClose={closeModal}
            style={{
                overlay: { zIndex: 1200 },
                content: { zIndex: 1201 }
            }}
        >
            {/* Note - we are giving this modal a z-index such that it is always above the first (choose a category to edit) modal: */}
            <form onSubmit={handleSubmit} >
                <div className="form-item">
                    <label htmlFor="category_name">Category</label>
                    <input id="category_name" name="category_name" type="text" required value={formValues.category_name} onChange={handleFormChange} />
                </div>
                <div className="form-item">
                    <label htmlFor="color">Colour</label>
                    <input id="color" name="color" type="color" value={formValues.color} onChange={handleFormChange} />
                </div>
                <div className="big-buttons-container">
                    <button type="submit" className="accented">Submit</button>
                    <button type="button" onClick={closeModal}>Cancel</button>
                </div>
            </form>
        </Modal>
    )
}