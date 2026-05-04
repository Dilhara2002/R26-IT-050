import React, { useEffect, useState } from 'react';
import $ from 'jquery';

import IconButton from './IconButton';

import './AdaptiveSubTable.css';

/**
 * @description AdaptiveTable is a component that displays data in a table format. 
 * The table can be toggled to show or hide the data and can be paginated.
 *  
 * @param {String} tableId - unique id for the table
 * @param {String} title - title of the table
 * @param {String} subtitle - subtitle of the table
 * @param {Object[]} headers - headers of the table. Should be an array of `objects` with the following properties: 
 * ```
 * {
 *      colKey: string // key to access the data in the data array
 *      icon: string // icon to display before the label. should be a google material 
 *      iconlabel: string // label to display as the header
 * }
 * ```
 * @param {object[]} data - data to display in the table. Should be an array of `objects` containing the keys specified in the headers
 * @param {Number} pagination - number of items to display per page
 * @param {React.Component} filters - filters to display above the table. Should be a `React` component
 * @param {Number} filterWidth - width of the filter container
 * @param {object} actions - 
 * ```
 *   actions = {
        enable: boolean, // whether to enable actions
        actionHeaderLabel: string, // label to display before the actions
        actionHeaderIcon: string, // icon to display before the label. should be a google material
        dataContainerClass: string, // class to add to the data container
        actions: [
            // Array of components to display as actions, events should be included in the components
        ]
        subActions: [
            // Array of components to display as sub actions, events should be included in the components
        ]    
    }
 * ```
 * @param {Function} onAddBtnClick - function to call when the add button is clicked
 * @param {Function} onReportBtnClick - function to call when the report button is clicked
 * @returns
 */
function AdaptiveSubTable({ tableId, title, subtitle, headers, data, pagination = 5, filters, filterWidth, actions, onAddBtnClick, onReportBtnClick }) {

    const [view, setView] = useState(true)
    const [page, setPage] = useState(1)

    const [startIndex, setStartIndex] = useState(0)
    const [endIndex, setEndIndex] = useState(pagination)

    useEffect(() => {
        setStartIndex((page - 1) * pagination);
        setEndIndex(page * pagination);
    }, [page, pagination])

    const toggle = () => {
        $(`#${tableId}__table-container`).slideToggle(500);
        setView(!view)
    }

    filterWidth = filterWidth || "400";

    return (
        <div className={`adaptive-sub-table-container`} id={tableId}>
            <div className={`adaptive-sub-table__title ${view ? "" : "hidden"}`}>
                <span className="adaptive-sub-table__title-container">
                    <span className="adaptive-sub-table__title-text">{title}</span>
                    {subtitle && <span className="adaptive-sub-table__subtitle">{subtitle}</span>}
                </span>

                {
                    filters && <div className="adaptive-sub-table__fiter-container" style={{ "width": `${filterWidth}px` }}>
                        {filters}
                    </div>
                }
                <div className="horizontal-container">
                    <IconButton onClick={onReportBtnClick} iconb={"file_save"} h={30} c="blue" content={"Export"} />
                    <IconButton onClick={onAddBtnClick} iconb={"add"} h={30} bg="green" c="white" content={"Add"} />
                    <div></div>
                    {
                        view ? <IconButton onClick={toggle} size={30} icona={"keyboard_arrow_down"} /> : <IconButton size={30} onClick={toggle} icona={"keyboard_arrow_up"} />
                    }
                </div>
            </div>
            <div id={`${tableId}__table-container`}>
                <div className='adaptive-sub-table__table-container'>
                <table className="adaptive-sub-table" id={`${tableId}__table`}>
                        <thead className="adaptive-sub-table__header">
                            <tr className='adaptive-sub-table__row'>
                            {
                                    headers.map((col, index) => (
                                        <td className="adaptive-sub-table__col" key={`${col.colKey}-${index}-thead`}>
                                            <span className="adaptive-sub-table-header-col">
                                                {col.icon && <span className='material-symbols-outlined adaptive-sub-table__header-icon'>{col.icon}</span>}
                                                {col.label}
                                            </span>
                                        </td>
                                    ))
                                }
                                {actions?.enable ?
                                    <td className="adaptive-sub-table__col">
                                        <span className="adaptive-sub-table-header-col">
                                            {actions.actionHeaderIcon && <span className='material-symbols-outlined adaptive-sub-table__header-icon'>{actions.actionHeaderIcon}</span>}
                                            {actions.actionHeaderLabel && actions.actionHeaderLabel}
                                        </span>
                                    </td> : null
                                }                              
                            </tr>
                        </thead>
                        <tbody className="adaptive-sub-table__body">
                            {
                                data.slice(startIndex, endIndex).map((row, index) => (
                                    <React.Fragment key={index}>
                                        <tr className="adaptive-sub-table__row main" key={`${index}-tbody`}>
                                            {headers.map((col, colIndex) => (
                                                <td className="adaptive-sub-table__col" key={`${col.colKey}-${colIndex}-main`}>
                                                    {row[col.colKey] || ''}
                                                </td>
                                            ))}
                                            {actions?.enable ?
                                                <td className="adaptive-sub-table__col">
                                                    <span className={actions.dataContainerClass}>
                                                        {actions?.actions?.map((action, actionIndex) => (
                                                            React.cloneElement(action, { key: actionIndex })
                                                        ))}
                                                    </span>
                                                </td> : null
                                            }
                                        </tr>
                                        {row.subdata && row.subdata.map((subrow, subindex) => (
                                            <tr className="adaptive-sub-table__row sub" key={`${index}-sub-${subindex}`}>
                                                {headers.map((col, colIndex) => (
                                                    <td className="adaptive-sub-table__col" key={`${col.colKey}-${colIndex}-sub`}>
                                                        {subrow[col.colKey] || ''}
                                                    </td>
                                                ))}
                                                {actions?.enable ?
                                                    <td className="adaptive-sub-table__col">
                                                        <span className={actions?.dataContainerClass}>
                                                            {actions?.subActions?.map((action, actionIndex) => (
                                                                React.cloneElement(action, { key: actionIndex })
                                                            ))}
                                                        </span>
                                                    </td> : null
                                                }
                                            </tr>
                                        ))}
                                        <tr className="adaptive-sub-table__spacer" key={`${index}-spacer`}></tr>
                                    </React.Fragment>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
                <div className="adaptive-sub-table__footer">
                    <span>
                        {
                            Array.from({ length: Math.ceil(data.length / pagination) }, (_, index) => (
                                <IconButton extraClass={`adaptive-sub-table__page-btn ${page === index + 1 ? "active" : ""}`} key={index} onClick={() => setPage(index + 1)} content={index + 1} w="40" lm="5" />
                            ))
                        }
                    </span>
                    <span>
                        <IconButton c="white" bg="blue" />
                    </span>
                </div>
            </div>
        </div>
    )
}

export default AdaptiveSubTable;