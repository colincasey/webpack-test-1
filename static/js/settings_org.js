import $ from "jquery";

import pygments_data from "../generated/pygments_data.json";

import * as blueslip from "./blueslip";
import * as channel from "./channel";
import * as confirm_dialog from "./confirm_dialog";
import {csrf_token} from "./csrf";
import {DropdownListWidget as dropdown_list_widget} from "./dropdown_list_widget";
import {$t, $t_html} from "./i18n";
import * as loading from "./loading";
import * as overlays from "./overlays";
import {page_params} from "./page_params";
import * as realm_icon from "./realm_icon";
import * as realm_logo from "./realm_logo";
import * as settings_config from "./settings_config";
import * as settings_notifications from "./settings_notifications";
import * as settings_ui from "./settings_ui";
import * as stream_settings_data from "./stream_settings_data";
import * as ui_report from "./ui_report";

export let parse_time_limit;
export let save_organization_settings;

const meta = {
    loaded: false,
};

export function reset() {
    meta.loaded = false;
}

export function maybe_disable_widgets() {
    if (page_params.is_owner) {
        return;
    }

    $(".organization-box [data-name='auth-methods']")
        .find("input, button, select, checked")
        .prop("disabled", true);

    if (page_params.is_admin) {
        $("#deactivate_realm_button").prop("disabled", true);
        $("#org-message-retention").find("input, select").prop("disabled", true);
        return;
    }

    $(".organization-box [data-name='organization-profile']")
        .find("input, textarea, button, select")
        .prop("disabled", true);

    $(".organization-box [data-name='organization-settings']")
        .find("input, textarea, button, select")
        .prop("disabled", true);

    $(".organization-box [data-name='organization-settings']")
        .find(".control-label-disabled")
        .addClass("enabled");

    $(".organization-box [data-name='organization-permissions']")
        .find("input, textarea, button, select")
        .prop("disabled", true);

    $(".organization-box [data-name='organization-permissions']")
        .find(".control-label-disabled")
        .addClass("enabled");
}

export function get_sorted_options_list(option_values_object) {
    const options_list = Object.keys(option_values_object).map((key) => ({
        ...option_values_object[key],
        key,
    }));
    let comparator = (x, y) => x.order - y.order;
    if (!options_list[0].order) {
        comparator = (x, y) => {
            const key_x = x.key.toUpperCase();
            const key_y = y.key.toUpperCase();
            if (key_x < key_y) {
                return -1;
            }
            if (key_x > key_y) {
                return 1;
            }
            return 0;
        };
    }
    options_list.sort(comparator);
    return options_list;
}

export function get_organization_settings_options() {
    const options = {};
    options.common_policy_values = get_sorted_options_list(settings_config.common_policy_values);
    options.user_group_edit_policy_values = get_sorted_options_list(
        settings_config.user_group_edit_policy_values,
    );
    options.private_message_policy_values = get_sorted_options_list(
        settings_config.private_message_policy_values,
    );
    options.wildcard_mention_policy_values = get_sorted_options_list(
        settings_config.wildcard_mention_policy_values,
    );
    return options;
}

export function get_realm_time_limits_in_minutes(property) {
    let val = (page_params[property] / 60).toFixed(1);
    if (Number.parseFloat(val, 10) === Number.parseInt(val, 10)) {
        val = Number.parseInt(val, 10);
    }
    return val.toString();
}

function get_property_value(property_name) {
    if (property_name === "realm_message_content_edit_limit_minutes") {
        return get_realm_time_limits_in_minutes("realm_message_content_edit_limit_seconds");
    }

    if (property_name === "realm_message_content_delete_limit_minutes") {
        return get_realm_time_limits_in_minutes("realm_message_content_delete_limit_seconds");
    }

    if (property_name === "realm_waiting_period_setting") {
        if (page_params.realm_waiting_period_threshold === 0) {
            return "none";
        }
        if (page_params.realm_waiting_period_threshold === 3) {
            return "three_days";
        }
        return "custom_days";
    }

    if (property_name === "realm_add_emoji_by_admins_only") {
        if (page_params.realm_add_emoji_by_admins_only) {
            return "by_admins_only";
        }
        return "by_anyone";
    }

    if (property_name === "realm_msg_edit_limit_setting") {
        if (!page_params.realm_allow_message_editing) {
            return "never";
        }
        for (const [value, elem] of settings_config.msg_edit_limit_dropdown_values) {
            if (elem.seconds === page_params.realm_message_content_edit_limit_seconds) {
                return value;
            }
        }
        return "custom_limit";
    }

    if (property_name === "realm_message_retention_setting") {
        if (page_params.realm_message_retention_days === settings_config.retain_message_forever) {
            return "retain_forever";
        }
        return "retain_for_period";
    }

    if (property_name === "realm_msg_delete_limit_setting") {
        if (!page_params.realm_allow_message_deleting) {
            return "never";
        }
        for (const [value, elem] of settings_config.msg_delete_limit_dropdown_values) {
            if (elem.seconds === page_params.realm_message_content_delete_limit_seconds) {
                return value;
            }
        }
        return "custom_limit";
    }

    if (property_name === "realm_org_join_restrictions") {
        if (page_params.realm_emails_restricted_to_domains) {
            return "only_selected_domain";
        }
        if (page_params.realm_disallow_disposable_email_addresses) {
            return "no_disposable_email";
        }
        return "no_restriction";
    }

    if (property_name === "realm_default_twenty_four_hour_time") {
        return JSON.stringify(page_params[property_name]);
    }

    return page_params[property_name];
}

export function extract_property_name(elem) {
    return elem.attr("id").split("-").join("_").replace("id_", "");
}

function get_subsection_property_elements(element) {
    const subsection = $(element).closest(".org-subsection-parent");
    return Array.from(subsection.find(".prop-element"));
}

const simple_dropdown_properties = [
    "realm_create_stream_policy",
    "realm_invite_to_stream_policy",
    "realm_user_group_edit_policy",
    "realm_private_message_policy",
    "realm_add_emoji_by_admins_only",
    "realm_invite_to_realm_policy",
    "realm_wildcard_mention_policy",
    "realm_move_messages_between_streams_policy",
];

function set_property_dropdown_value(property_name) {
    $(`#id_${CSS.escape(property_name)}`).val(get_property_value(property_name));
}

function change_element_block_display_property(elem_id, show_element) {
    const elem = $(`#${CSS.escape(elem_id)}`);
    if (show_element) {
        elem.parent().show();
    } else {
        elem.parent().hide();
    }
}

function set_realm_waiting_period_dropdown() {
    const value = get_property_value("realm_waiting_period_setting");
    $("#id_realm_waiting_period_setting").val(value);
    change_element_block_display_property(
        "id_realm_waiting_period_threshold",
        value === "custom_days",
    );
}

function set_video_chat_provider_dropdown() {
    const chat_provider_id = page_params.realm_video_chat_provider;
    $("#id_realm_video_chat_provider").val(chat_provider_id);
}

function set_giphy_rating_dropdown() {
    const rating_id = page_params.realm_giphy_rating;
    $("#id_realm_giphy_rating").val(rating_id);
}

function set_msg_edit_limit_dropdown() {
    const value = get_property_value("realm_msg_edit_limit_setting");
    $("#id_realm_msg_edit_limit_setting").val(value);
    change_element_block_display_property(
        "id_realm_message_content_edit_limit_minutes",
        value === "custom_limit",
    );
    settings_ui.disable_sub_setting_onchange(
        value !== "never",
        "id_realm_allow_community_topic_editing",
        true,
    );
}

function set_msg_delete_limit_dropdown() {
    const value = get_property_value("realm_msg_delete_limit_setting");
    $("#id_realm_msg_delete_limit_setting").val(value);
    change_element_block_display_property(
        "id_realm_message_content_delete_limit_minutes",
        value === "custom_limit",
    );
}

function set_message_retention_setting_dropdown() {
    const value = get_property_value("realm_message_retention_setting");
    $("#id_realm_message_retention_setting").val(value);
    change_element_block_display_property(
        "id_realm_message_retention_days",
        value === "retain_for_period",
    );
    if (
        get_property_value("realm_message_retention_days") ===
        settings_config.retain_message_forever
    ) {
        $("#id_realm_message_retention_days").val("");
    }
}

function set_org_join_restrictions_dropdown() {
    const value = get_property_value("realm_org_join_restrictions");
    $("#id_realm_org_join_restrictions").val(value);
    change_element_block_display_property(
        "allowed_domains_label",
        value === "only_selected_domain",
    );
}

function set_message_content_in_email_notifications_visiblity() {
    change_element_block_display_property(
        "message_content_in_email_notifications_label",
        page_params.realm_message_content_allowed_in_email_notifications,
    );
}

function set_digest_emails_weekday_visibility() {
    change_element_block_display_property(
        "id_realm_digest_weekday",
        page_params.realm_digest_emails_enabled,
    );
}

export function populate_realm_domains(realm_domains) {
    if (!meta.loaded) {
        return;
    }

    const domains_list = realm_domains.map((realm_domain) =>
        realm_domain.allow_subdomains ? "*." + realm_domain.domain : realm_domain.domain,
    );
    let domains = domains_list.join(", ");
    if (domains.length === 0) {
        domains = $t({defaultMessage: "None"});
    }
    $("#allowed_domains_label").text($t({defaultMessage: "Allowed domains: {domains}"}, {domains}));

    const realm_domains_table_body = $("#realm_domains_table tbody").expectOne();
    realm_domains_table_body.find("tr").remove();

    for (const realm_domain of realm_domains) {
        realm_domains_table_body.append(
            render_settings_admin_realm_domains_list({
                realm_domain,
            }),
        );
    }
}

function sort_object_by_key(obj) {
    const keys = Object.keys(obj).sort();
    const new_obj = {};

    for (const key of keys) {
        new_obj[key] = obj[key];
    }

    return new_obj;
}

export function populate_auth_methods(auth_methods) {
    if (!meta.loaded) {
        return;
    }
    const auth_methods_table = $("#id_realm_authentication_methods").expectOne();
    auth_methods = sort_object_by_key(auth_methods);
    let rendered_auth_method_rows = "";
    for (const [auth_method, value] of Object.entries(auth_methods)) {
        rendered_auth_method_rows += render_settings_admin_auth_methods_list({
            method: auth_method,
            enabled: value,
            is_owner: page_params.is_owner,
        });
    }
    auth_methods_table.html(rendered_auth_method_rows);
}

function update_dependent_subsettings(property_name) {
    if (simple_dropdown_properties.includes(property_name)) {
        set_property_dropdown_value(property_name);
        return;
    }

    switch (property_name) {
        case "realm_waiting_period_threshold":
            set_realm_waiting_period_dropdown();
            break;
        case "realm_video_chat_provider":
            set_video_chat_provider_dropdown();
            break;
        case "realm_msg_edit_limit_setting":
        case "realm_message_content_edit_limit_minutes":
            set_msg_edit_limit_dropdown();
            break;
        case "realm_message_retention_days":
            set_message_retention_setting_dropdown();
            break;
        case "realm_msg_delete_limit_setting":
        case "realm_message_content_delete_limit_minutes":
            set_msg_delete_limit_dropdown();
            break;
        case "realm_org_join_restrictions":
            set_org_join_restrictions_dropdown();
            break;
        case "realm_message_content_allowed_in_email_notifications":
            set_message_content_in_email_notifications_visiblity();
            break;
        case "realm_digest_emails_enabled":
            settings_notifications.set_enable_digest_emails_visibility();
            set_digest_emails_weekday_visibility();
            break;
    }
}

export let default_code_language_widget = null;
export let notifications_stream_widget = null;
export let signup_notifications_stream_widget = null;

function discard_property_element_changes(elem) {
    elem = $(elem);
    const property_name = extract_property_name(elem);
    const property_value = get_property_value(property_name);

    switch (property_name) {
        case "realm_authentication_methods":
            populate_auth_methods(property_value);
            break;
        case "realm_notifications_stream_id":
            notifications_stream_widget.render(property_value);
            break;
        case "realm_signup_notifications_stream_id":
            signup_notifications_stream_widget.render(property_value);
            break;
        case "realm_default_code_block_language":
            default_code_language_widget.render(property_value);
            break;
        default:
            if (property_value !== undefined) {
                set_input_element_value(elem, property_value);
            } else {
                blueslip.error("Element refers to unknown property " + property_name);
            }
    }

    update_dependent_subsettings(property_name);
}

export function sync_realm_settings(property) {
    if (!overlays.settings_open()) {
        return;
    }

    const value = page_params[`realm_${property}`];
    switch (property) {
        case "notifications_stream_id":
            notifications_stream_widget.render(value);
            break;
        case "signup_notifications_stream_id":
            signup_notifications_stream_widget.render(value);
            break;
        case "default_code_block_language":
            default_code_language_widget.render(value);
            break;
    }

    switch (property) {
        case "message_content_edit_limit_seconds":
            property = "message_content_edit_limit_minutes";
            break;
        case "allow_message_editing":
            property = "msg_edit_limit_setting";
            break;
        case "emails_restricted_to_domains":
        case "disallow_disposable_email_addresses":
            property = "org_join_restrictions";
            break;
        case "message_content_delete_limit_seconds":
            property = "message_content_delete_limit_minutes";
            break;
        case "allow_message_deleting":
            property = "msg_delete_limit_setting";
            break;
    }
    const element = $(`#id_realm_${CSS.escape(property)}`);
    if (element.length) {
        discard_property_element_changes(element);
    }
}

export function change_save_button_state($element, state) {
    function show_hide_element($element, show, fadeout_delay) {
        if (show) {
            $element.removeClass("hide").addClass(".show").fadeIn(300);
            return;
        }
        setTimeout(() => {
            $element.fadeOut(300);
        }, fadeout_delay);
    }

    const $saveBtn = $element.find(".save-button");
    const $textEl = $saveBtn.find(".save-discard-widget-button-text");

    if (state !== "saving") {
        $saveBtn.removeClass("saving");
    }

    if (state === "discarded") {
        show_hide_element($element, false, 0);
        return;
    }

    let button_text;
    let data_status;
    let is_show;
    switch (state) {
        case "unsaved":
            button_text = $t({defaultMessage: "Save changes"});
            data_status = "unsaved";
            is_show = true;

            $element.find(".discard-button").show();
            break;
        case "saved":
            button_text = $t({defaultMessage: "Save changes"});
            data_status = "";
            is_show = false;
            break;
        case "saving":
            button_text = $t({defaultMessage: "Saving"});
            data_status = "saving";
            is_show = true;

            $element.find(".discard-button").hide();
            $saveBtn.addClass("saving");
            break;
        case "failed":
            button_text = $t({defaultMessage: "Save changes"});
            data_status = "failed";
            is_show = true;
            break;
        case "succeeded":
            button_text = $t({defaultMessage: "Saved"});
            data_status = "saved";
            is_show = false;
            break;
    }

    $textEl.text(button_text);
    $saveBtn.attr("data-status", data_status);
    show_hide_element($element, is_show, 800);
}

function get_input_type(input_elem, input_type) {
    if (["boolean", "string", "number"].includes(input_type)) {
        return input_type;
    }
    return input_elem.data("setting-widget-type");
}

export function get_input_element_value(input_elem, input_type) {
    input_elem = $(input_elem);
    input_type = get_input_type(input_elem, input_type);
    switch (input_type) {
        case "boolean":
            return input_elem.prop("checked");
        case "string":
            return input_elem.val().trim();
        case "number":
            return Number.parseInt(input_elem.val().trim(), 10);
        default:
            return undefined;
    }
}

export function set_input_element_value(input_elem, value) {
    const input_type = get_input_type(input_elem, typeof value);
    if (input_type) {
        if (input_type === "boolean") {
            return input_elem.prop("checked", value);
        } else if (input_type === "string" || input_type === "number") {
            return input_elem.val(value);
        }
    }
    blueslip.error(`Failed to set value of property ${extract_property_name(input_elem)}`);
    return undefined;
}

export function set_up() {
    build_page();
    maybe_disable_widgets();
}

function get_auth_method_table_data() {
    const new_auth_methods = {};
    const auth_method_rows = $("#id_realm_authentication_methods").find("tr.method_row");

    for (const method_row of auth_method_rows) {
        new_auth_methods[$(method_row).data("method")] = $(method_row)
            .find("input")
            .prop("checked");
    }

    return new_auth_methods;
}

function check_property_changed(elem) {
    elem = $(elem);
    const property_name = extract_property_name(elem);
    let current_val = get_property_value(property_name);
    let changed_val;

    switch (property_name) {
        case "realm_authentication_methods":
            current_val = sort_object_by_key(current_val);
            current_val = JSON.stringify(current_val);
            changed_val = get_auth_method_table_data();
            changed_val = JSON.stringify(changed_val);
            break;
        case "realm_notifications_stream_id":
            changed_val = Number.parseInt(notifications_stream_widget.value(), 10);
            break;
        case "realm_signup_notifications_stream_id":
            changed_val = Number.parseInt(signup_notifications_stream_widget.value(), 10);
            break;
        case "realm_default_code_block_language":
            changed_val = default_code_language_widget.value();
            break;
        default:
            if (current_val !== undefined) {
                changed_val = get_input_element_value(elem, typeof current_val);
            } else {
                blueslip.error("Element refers to unknown property " + property_name);
            }
    }
    return current_val !== changed_val;
}

export function save_discard_widget_status_handler(subsection) {
    subsection.find(".subsection-failed-status p").hide();
    subsection.find(".save-button").show();
    const properties_elements = get_subsection_property_elements(subsection);
    const show_change_process_button = properties_elements.some((elem) =>
        check_property_changed(elem),
    );

    const save_btn_controls = subsection.find(".subsection-header .save-button-controls");
    const button_state = show_change_process_button ? "unsaved" : "discarded";
    change_save_button_state(save_btn_controls, button_state);
}

export function init_dropdown_widgets() {
    const streams = stream_settings_data.get_streams_for_settings_page();
    const notification_stream_options = {
        data: streams.map((x) => ({
            name: x.name,
            value: x.stream_id.toString(),
        })),
        on_update: () => {
            save_discard_widget_status_handler($("#org-notifications"));
        },
        default_text: $t({defaultMessage: "Disabled"}),
        render_text: (x) => `#${x}`,
        null_value: -1,
    };
    notifications_stream_widget = dropdown_list_widget({
        widget_name: "realm_notifications_stream_id",
        value: page_params.realm_notifications_stream_id,
        ...notification_stream_options,
    });
    signup_notifications_stream_widget = dropdown_list_widget({
        widget_name: "realm_signup_notifications_stream_id",
        value: page_params.realm_signup_notifications_stream_id,
        ...notification_stream_options,
    });
    default_code_language_widget = dropdown_list_widget({
        widget_name: "realm_default_code_block_language",
        data: Object.keys(pygments_data.langs).map((x) => ({
            name: x,
            value: x,
        })),
        value: page_params.realm_default_code_block_language,
        on_update: () => {
            save_discard_widget_status_handler($("#org-other-settings"));
        },
        default_text: $t({defaultMessage: "No language set"}),
    });
}

export function build_page() {
    meta.loaded = true;

    loading.make_indicator($("#admin_page_auth_methods_loading_indicator"));

    // Initialize all the dropdown list widgets.
    init_dropdown_widgets();
    // Populate realm domains
    populate_realm_domains(page_params.realm_domains);

    // Populate authentication methods table
    populate_auth_methods(page_params.realm_authentication_methods);

    for (const property_name of simple_dropdown_properties) {
        set_property_dropdown_value(property_name);
    }

    set_realm_waiting_period_dropdown();
    set_video_chat_provider_dropdown();
    set_giphy_rating_dropdown();
    set_msg_edit_limit_dropdown();
    set_msg_delete_limit_dropdown();
    set_message_retention_setting_dropdown();
    set_org_join_restrictions_dropdown();
    set_message_content_in_email_notifications_visiblity();
    set_digest_emails_weekday_visibility();

    $(".admin-realm-form").on("change input", "input, select, textarea", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // This event handler detects whether after these input
        // changes, any fields have different values from the current
        // official values stored in the database and page_params.  If
        // they do, we transition to the "unsaved" state showing the
        // save/discard widget; otherwise, we hide that widget (the
        // "discarded" state).

        if ($(e.target).hasClass("no-input-change-detection")) {
            // This is to prevent input changes detection in elements
            // within a subsection whose changes should not affect the
            // visibility of the discard button
            return false;
        }

        const subsection = $(e.target).closest(".org-subsection-parent");
        save_discard_widget_status_handler(subsection);
        return undefined;
    });

    $(".organization").on("click", ".subsection-header .subsection-changes-discard button", (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (const elem of get_subsection_property_elements(e.target)) {
            discard_property_element_changes(elem);
        }
        const save_btn_controls = $(e.target).closest(".save-button-controls");
        change_save_button_state(save_btn_controls, "discarded");
    });

    save_organization_settings = function (data, save_button) {
        const subsection_parent = save_button.closest(".org-subsection-parent");
        const save_btn_container = subsection_parent.find(".save-button-controls");
        const failed_alert_elem = subsection_parent.find(".subsection-failed-status p");
        change_save_button_state(save_btn_container, "saving");
        channel.patch({
            url: "/json/realm",
            data,
            success() {
                failed_alert_elem.hide();
                change_save_button_state(save_btn_container, "succeeded");
            },
            error(xhr) {
                change_save_button_state(save_btn_container, "failed");
                save_button.hide();
                ui_report.error($t_html({defaultMessage: "Save failed"}), xhr, failed_alert_elem);
            },
        });
    };

    parse_time_limit = function parse_time_limit(elem) {
        return Math.floor(Number.parseFloat(elem.val(), 10).toFixed(1) * 60);
    };

    function get_complete_data_for_subsection(subsection) {
        let data = {};

        switch (subsection) {
            case "msg_editing": {
                const edit_limit_setting_value = $("#id_realm_msg_edit_limit_setting").val();
                if (edit_limit_setting_value === "never") {
                    data.allow_message_editing = false;
                } else if (edit_limit_setting_value === "custom_limit") {
                    data.message_content_edit_limit_seconds = parse_time_limit(
                        $("#id_realm_message_content_edit_limit_minutes"),
                    );
                    // Disable editing if the parsed time limit is 0 seconds
                    data.allow_message_editing = Boolean(data.message_content_edit_limit_seconds);
                } else {
                    data.allow_message_editing = true;
                    data.message_content_edit_limit_seconds =
                        settings_config.msg_edit_limit_dropdown_values.get(
                            edit_limit_setting_value,
                        ).seconds;
                }
                const delete_limit_setting_value = $("#id_realm_msg_delete_limit_setting").val();
                if (delete_limit_setting_value === "never") {
                    data.allow_message_deleting = false;
                } else if (delete_limit_setting_value === "custom_limit") {
                    data.message_content_delete_limit_seconds = parse_time_limit(
                        $("#id_realm_message_content_delete_limit_minutes"),
                    );
                    // Disable deleting if the parsed time limit is 0 seconds
                    data.allow_message_deleting = Boolean(
                        data.message_content_delete_limit_seconds,
                    );
                } else {
                    data.allow_message_deleting = true;
                    data.message_content_delete_limit_seconds =
                        settings_config.msg_delete_limit_dropdown_values.get(
                            delete_limit_setting_value,
                        ).seconds;
                }
                break;
            }
            case "notifications":
                data.notifications_stream_id = Number.parseInt(
                    notifications_stream_widget.value(),
                    10,
                );
                data.signup_notifications_stream_id = Number.parseInt(
                    signup_notifications_stream_widget.value(),
                    10,
                );
                break;
            case "message_retention": {
                const message_retention_setting_value = $(
                    "#id_realm_message_retention_setting",
                ).val();
                if (message_retention_setting_value === "retain_forever") {
                    data.message_retention_days = JSON.stringify("forever");
                } else {
                    data.message_retention_days = JSON.stringify(
                        get_input_element_value($("#id_realm_message_retention_days")),
                    );
                }
                break;
            }
            case "other_settings": {
                const code_block_language_value = default_code_language_widget.value();
                // No need to JSON-encode, since this value is already a string.
                data.default_code_block_language = code_block_language_value;
                break;
            }
            case "other_permissions": {
                const add_emoji_permission = $("#id_realm_add_emoji_by_admins_only").val();
                switch (add_emoji_permission) {
                    case "by_admins_only":
                        data.add_emoji_by_admins_only = true;
                        break;
                    case "by_anyone":
                        data.add_emoji_by_admins_only = false;
                        break;
                }
                break;
            }
            case "org_join": {
                const org_join_restrictions = $("#id_realm_org_join_restrictions").val();
                switch (org_join_restrictions) {
                    case "only_selected_domain":
                        data.emails_restricted_to_domains = true;
                        data.disallow_disposable_email_addresses = false;
                        break;
                    case "no_disposable_email":
                        data.emails_restricted_to_domains = false;
                        data.disallow_disposable_email_addresses = true;
                        break;
                    case "no_restriction":
                        data.disallow_disposable_email_addresses = false;
                        data.emails_restricted_to_domains = false;
                        break;
                }

                const waiting_period_threshold = $("#id_realm_waiting_period_setting").val();
                switch (waiting_period_threshold) {
                    case "none":
                        data.waiting_period_threshold = 0;
                        break;
                    case "three_days":
                        data.waiting_period_threshold = 3;
                        break;
                    case "custom_days":
                        data.waiting_period_threshold = $(
                            "#id_realm_waiting_period_threshold",
                        ).val();
                        break;
                }
                break;
            }
            case "auth_settings":
                data = {};
                data.authentication_methods = JSON.stringify(get_auth_method_table_data());
                break;
            case "user_defaults": {
                const realm_default_twenty_four_hour_time = $(
                    "#id_realm_default_twenty_four_hour_time",
                ).val();
                data.default_twenty_four_hour_time = realm_default_twenty_four_hour_time;
                break;
            }
        }
        return data;
    }

    function populate_data_for_request(subsection) {
        const data = {};
        const properties_elements = get_subsection_property_elements(subsection);

        for (let input_elem of properties_elements) {
            input_elem = $(input_elem);
            if (check_property_changed(input_elem)) {
                const input_value = get_input_element_value(input_elem);
                if (input_value !== undefined) {
                    const property_name = input_elem.attr("id").replace("id_realm_", "");
                    data[property_name] = input_value;
                }
            }
        }

        return data;
    }

    $(".organization").on("click", ".subsection-header .subsection-changes-save button", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const save_button = $(e.currentTarget);
        const subsection_id = save_button.attr("id").replace("org-submit-", "");
        const subsection = subsection_id.split("-").join("_");
        const subsection_elem = save_button.closest(".org-subsection-parent");

        const data = {
            ...populate_data_for_request(subsection_elem),
            ...get_complete_data_for_subsection(subsection),
        };
        save_organization_settings(data, save_button);
    });

    $(".org-subsection-parent").on("keydown", "input", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
            e.preventDefault();
            $(e.target)
                .closest(".org-subsection-parent")
                .find(".subsection-changes-save button")
                .trigger("click");
        }
    });

    $("#id_realm_msg_edit_limit_setting").on("change", (e) => {
        const msg_edit_limit_dropdown_value = e.target.value;
        change_element_block_display_property(
            "id_realm_message_content_edit_limit_minutes",
            msg_edit_limit_dropdown_value === "custom_limit",
        );
    });

    $("#id_realm_msg_delete_limit_setting").on("change", (e) => {
        const msg_delete_limit_dropdown_value = e.target.value;
        change_element_block_display_property(
            "id_realm_message_content_delete_limit_minutes",
            msg_delete_limit_dropdown_value === "custom_limit",
        );
    });

    $("#id_realm_message_retention_setting").on("change", (e) => {
        const message_retention_setting_dropdown_value = e.target.value;
        change_element_block_display_property(
            "id_realm_message_retention_days",
            message_retention_setting_dropdown_value === "retain_for_period",
        );
    });

    $("#id_realm_waiting_period_setting").on("change", function () {
        const waiting_period_threshold = this.value;
        change_element_block_display_property(
            "id_realm_waiting_period_threshold",
            waiting_period_threshold === "custom_days",
        );
    });

    $("#id_realm_org_join_restrictions").on("change", (e) => {
        const org_join_restrictions = e.target.value;
        const node = $("#allowed_domains_label").parent();
        if (org_join_restrictions === "only_selected_domain") {
            node.show();
            if (page_params.realm_domains.length === 0) {
                overlays.open_modal("#realm_domains_modal");
            }
        } else {
            node.hide();
        }
    });

    $("#id_realm_org_join_restrictions").on("click", (e) => {
        // This prevents the disappearance of modal when there are
        // no allowed domains otherwise it gets closed due to
        // the click event handler attached to `#settings_overlay_container`
        e.stopPropagation();
    });

    function fade_status_element(elem) {
        setTimeout(() => {
            elem.fadeOut(500);
        }, 1000);
    }

    $("#realm_domains_table").on("click", ".delete_realm_domain", function () {
        const domain = $(this).parents("tr").find(".domain").text();
        const url = "/json/realm/domains/" + domain;
        const realm_domains_info = $(".realm_domains_info");

        channel.del({
            url,
            success() {
                ui_report.success(
                    $t_html({defaultMessage: "Deleted successfully!"}),
                    realm_domains_info,
                );
                fade_status_element(realm_domains_info);
            },
            error(xhr) {
                ui_report.error($t_html({defaultMessage: "Failed"}), xhr, realm_domains_info);
                fade_status_element(realm_domains_info);
            },
        });
    });

    $("#submit-add-realm-domain").on("click", () => {
        const realm_domains_info = $(".realm_domains_info");
        const widget = $("#add-realm-domain-widget");
        const domain = widget.find(".new-realm-domain").val();
        const allow_subdomains = widget.find(".new-realm-domain-allow-subdomains").prop("checked");
        const data = {
            domain,
            allow_subdomains: JSON.stringify(allow_subdomains),
        };

        channel.post({
            url: "/json/realm/domains",
            data,
            success() {
                $("#add-realm-domain-widget .new-realm-domain").val("");
                $("#add-realm-domain-widget .new-realm-domain-allow-subdomains").prop(
                    "checked",
                    false,
                );
                ui_report.success(
                    $t_html({defaultMessage: "Added successfully!"}),
                    realm_domains_info,
                );
                fade_status_element(realm_domains_info);
            },
            error(xhr) {
                ui_report.error($t_html({defaultMessage: "Failed"}), xhr, realm_domains_info);
                fade_status_element(realm_domains_info);
            },
        });
    });

    $("#realm_domains_table").on("change", ".allow-subdomains", function (e) {
        e.stopPropagation();
        const realm_domains_info = $(".realm_domains_info");
        const domain = $(this).parents("tr").find(".domain").text();
        const allow_subdomains = $(this).prop("checked");
        const url = "/json/realm/domains/" + domain;
        const data = {
            allow_subdomains: JSON.stringify(allow_subdomains),
        };

        channel.patch({
            url,
            data,
            success() {
                if (allow_subdomains) {
                    ui_report.success(
                        $t_html(
                            {defaultMessage: "Update successful: Subdomains allowed for {domain}"},
                            {domain},
                        ),
                        realm_domains_info,
                    );
                } else {
                    ui_report.success(
                        $t_html(
                            {
                                defaultMessage:
                                    "Update successful: Subdomains no longer allowed for {domain}",
                            },
                            {domain},
                        ),
                        realm_domains_info,
                    );
                }
                fade_status_element(realm_domains_info);
            },
            error(xhr) {
                ui_report.error($t_html({defaultMessage: "Failed"}), xhr, realm_domains_info);
                fade_status_element(realm_domains_info);
            },
        });
    });

    function realm_icon_logo_upload_complete(spinner, upload_text, delete_button) {
        spinner.css({visibility: "hidden"});
        upload_text.show();
        delete_button.show();
    }

    function realm_icon_logo_upload_start(spinner, upload_text, delete_button) {
        spinner.css({visibility: "visible"});
        upload_text.hide();
        delete_button.hide();
    }

    function upload_realm_logo_or_icon(file_input, night, icon) {
        const form_data = new FormData();
        let widget;
        let url;

        form_data.append("csrfmiddlewaretoken", csrf_token);
        for (const [i, file] of Array.prototype.entries.call(file_input[0].files)) {
            form_data.append("file-" + i, file);
        }
        if (icon) {
            url = "/json/realm/icon";
            widget = "#realm-icon-upload-widget";
        } else {
            if (night) {
                widget = "#realm-night-logo-upload-widget";
            } else {
                widget = "#realm-day-logo-upload-widget";
            }
            url = "/json/realm/logo";
            form_data.append("night", JSON.stringify(night));
        }
        const spinner = $(`${widget} .upload-spinner-background`).expectOne();
        const upload_text = $(`${widget}  .image-upload-text`).expectOne();
        const delete_button = $(`${widget}  .image-delete-button`).expectOne();
        const error_field = $(`${widget}  .image_file_input_error`).expectOne();
        realm_icon_logo_upload_start(spinner, upload_text, delete_button);
        error_field.hide();
        channel.post({
            url,
            data: form_data,
            cache: false,
            processData: false,
            contentType: false,
            success() {
                realm_icon_logo_upload_complete(spinner, upload_text, delete_button);
            },
            error(xhr) {
                realm_icon_logo_upload_complete(spinner, upload_text, delete_button);
                ui_report.error("", xhr, error_field);
            },
        });
    }

    realm_icon.build_realm_icon_widget(upload_realm_logo_or_icon, null, true);
    if (page_params.zulip_plan_is_not_limited) {
        realm_logo.build_realm_logo_widget(upload_realm_logo_or_icon, false);
        realm_logo.build_realm_logo_widget(upload_realm_logo_or_icon, true);
    }

    $("#deactivate_realm_button").on("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        function do_deactivate_realm() {
            channel.post({
                url: "/json/realm/deactivate",
                error(xhr) {
                    ui_report.error(
                        $t_html({defaultMessage: "Failed"}),
                        xhr,
                        $("#admin-realm-deactivation-status").expectOne(),
                    );
                },
            });
        }

        const html_body = render_settings_deactivate_realm_modal();
        const modal_parent = $(".organization-box");

        confirm_dialog.launch({
            parent: modal_parent,
            html_heading: $t_html({defaultMessage: "Deactivate organization"}),
            help_link: "/help/deactivate-your-organization",
            html_body,
            html_yes_button: $t_html({defaultMessage: "Confirm"}),
            on_click: do_deactivate_realm,
        });
    });
}

export function randomFn() {
  console.log(`1149914331158892339796931798595389839334666823472318573356629486816665785436575975978895869795746116689499821216213933339267582
6575438457565425439938187646668643538871181494727416389542632341775793256586874323144187191479494884353859266398144431547875752
1591197537145767277249436638551141632795275345631417813946376927585744427164546398127978742621163226995753728973916955753225378
5683851627837389336826967724572873383941948219551338963368194468256568858758833491643256524679298816552958768353678899662587528
2557811895439625512441983578853476682835541769336893724458718671485329846133912981564117423988688716261281444514288316525474535
4675174676248149697526212283125625751655946486354686741833146754315727622236649413359422788437447579558787295511843512763167188
3348931127293531321267578313432767277157692592751436715627581896798938156321434117512799484292882286598129778735216128851142459
7399734592844899773348315954233762867658524637864344697192943893135863548579537126658148816681889587511285769985318538342998299
5999524232395916453722357723742859451923865643312533556797657382389371666489883685658955188718311322558829739628712958158219195
2217612737795444622574677374382492715728749419946824786952767797381563474152777679141477198712721495884455966192755414668523538
3972895828744377427836514423363443954842438153592161835389691675124614875289876739618355788115232181229698645565736677536323682
3656784293474413641336817431519733319897891147982665496834576563181867113215164251518724633548358548975875682786136173945154677
6291742855534114291329946513429578913943512381421249273617687756168992857442566273184867762376524828557998681557747122489289433
6221764813754463197295381571947262695712458986429187956961927772658449643691388735743389965252623251383196646954857966798532655
6213148423752387656877178391151543215979835885432143811528751717453163149673342135415614338642879197778864987715357953533675886
5735633378168572647843641332394895471228877388697835621533873192946642122848816195727385785589563343493785761418499376138866986
9924816822624799517378962442374758395342557336344286496515428695413234453669731666498635783445426771149621163525272341596439561
1365285724973429895723753162931115171948147764891657178446287646683494711643736189384799797632681841545457827274181679491521574
2558746338549829287366186184193252344761554281646786395974628485844314716956859825361544462376818933695529662859615542114988397
3523494923785791819824675188477366292111275992257774524671972271882568836475651665123776143897427696494974113136767925337247846
3136811365899775614698828743811785167594158962236824662952444258281657398436619757782114393349686152952285391726654266683648931
8961637464156859617827644349597745797945279176488518467448424951242948662363297571223719374763754622448439156349433249819369685
6894964265884284772868196996693632685237785372389337134268743979974234566872477341731399652889596787872318366354173397922149954
8127633286659954346547489375598952122595929259419163355358978891925978279341482656238274818757759547611968868292164541894328388
2227625429738774634733725446783194858415235171262821417631387546929466159182583856266945429676153963136345748164945764984949189
6638956126536739659126635183547266621777971655574944741533637559937992573996662433742533719539994281656486895911378779914698531
9246713554264529376635881281954822342774529668346225558824447116256175411883862477512955751418274171887392576518514144988458771
5382554188218293658859112313839944831315488232697216363156837634746651414867651677119972925236895966866527428923614444453399382
1654635123783942842611473435811141184139368425881831554199161379712515296685452166439531137251783253965118281879251479331157175
1674754598835649221887689583587869268783394759827732819631939392446479226697947652477679435369123193617345523724496618433814121
6793729938912274237862499962551831983682461517666897494195916331531854382192714464697511931363426986316693157215576226386492814
3596678327871497546269518564388219124568685119759377965397641629454385423167214671663519574929455852371517838627471177315758561
3927832197576827156353229857661474252913738574396683328536581573797468757187351773659525344784297691388215825911922981268682254
8531789894774227956499943355751929371159714599569584941217441524563478682356898978482471517324766598678464672145353279684283482
1928152668561599938389968493473494887161229323343879856758963857997193737888163425782272513994296266572976787345659799561192635
3225726965751179917645328224664735526156847264764337584137833798773444824556269974119695972288749789331657774723585834564349446
4995342713126912585462761393266494831957311782831815958156978383437814823191594379926877725354347586628484896225251516198263221
1711418195775884572569488972197271449222326253926733131574457474748912578885769325172799159554871798738252499283167992561968356
9696972374894317844584543266747197399174925447414149659718158341216369382469726418141959149315543968671358521466271525288739466
6776219463764559141623362247143634791972567178746757939215195475451888457344474892513867183776828924678914818349473659229488663
7886124775427515172598984949851115919846986374492339261893728285276236971566431459854421354127922688698267255476784252164321826
5739836889462412543646132492722739214324745597736566253719829292253599982984592895712837831881759586415653433719188599757718596
3723592855113947111274197828454957315594535775928855587881592716917773224971217591285922562896431677797592625231264879682926727
9447123346667239996315527155468532146978138664513313149159132956515195466763645839652598584468657297933575184187838532432465893
6585239222267643991123853116434189438768929739847514457629868778883942115957716188576735382845869562465867732789564499293691916
1868631115451467732343196672684954743936712625755361776993761323688938438945848794677552366618442345744652644898924323157996118
8393285775634718648473117299244258132935116295118167219625971332357497473589546878863898768929376578263965897391254513199963239
8281545211176116921268555854835864734999694173237563514891644247826236777794574672664862528115279216365647421597129656429532821
9349639396872813835836851566929773315567248978627439611145331524519981988132988426723573881623398255645167214195892898272499473
1593694454292237779443958437674969353816783176837147866556478927193256556329959134587535484266159181858589155772334874189373578
4548683762546366613498858851921955995828318379162431432313534649286312399747264239148981463164811968951837712248475334364148851
2738575659691325343446273658376932593394638433491539951342358289184567762353288765986282189788125644587566656939953242991293344
5216694558719418569417424682288756892671928284316127499711978417955872161342449924997835612564948786968787558786892233852574814
2668738964768344733319748661893195916266862738785973295111685332324147917432377641473324995416788397717766896897319397928965647
5872187827636494774625363322155313368857513277521999381353918656864866865888411337381757861418526238855633823124135259457799436
7537276551557627742336428253914621785542425325396876996979211571294554715611126155471736397758754659417877595674187877969179129
3829848695823895394689721821334468636519436977998627848616257915435762883623217897394496979334267955252437932366997812634622211
7446278914864324857743295693385935631671227593755349381948666567251531841791662617894188153784169688428952527632261151883641776
4861955646256737274722317787792151861517794243398693269168292737177937249773624895718992172813384269186394646787568456121811627
5827899819567214912885719832136815924938633376237291433959843355911266898617534236943941838567175416116527751922921823151225169
6636296129765642612979346262513238672557696227338957541891128812671514813153822559952413636449559199354916893792385181411122197
5375445874639297694658976339385351965756979237849615264187268751472544416463868575966246643663481212413719128163184418359415335
5671217155844974675215855139161422894357923528235449394421986518566786916166265472665188685475887389659487618217626433571134581
4883741334279829929849215752857541389851653742259679875189563311756542267842748452512732596965656426756851961414212627229727463
1527334114549769186676667772293885233419419495522155772687727322171259775487428198741965896938192135311593673397193111585872612
8552138942793677732461695574523697983656867383836446366866357433735749248986632863162132757487638194351545682921967274792271175
6181791356689711921659228858528299218322654888527952148832785631938747723974587243439467292781891853779528849186472191469799359
5618981788118123359428651782768124549117681538372532574692516765227828456366541621816186679841531512264914727757516864877776639
7883198419979548417881733728713849447974538261779575271178758489532245898123697419612272591818493386239433824728417115139938292
4832113799341677582215459262214595484512298382284418231676693535929728128374417313798623249583993313463956849562767764472613658
2586666446537872298867858661759358999994598991554524249249692781177821694925451964116488215885239756864326461566297946217547193
6395273919522837681386848159376786487539354282126785969175453744691354857292153151524576458843334953351946911395792435828681233
2724115626327729293574217669918941889722312762293812338694422967763633584275583726593314416524227426598156827554293892948878931
5734398244264423367566642762859548356251186687538198721449292298639611595398982229268531428443484398521717713381763461193269263
6549257752977246316981796735111263897352828289738849836678436515782131427728116133877481393388259912194142454432913141334658979
3926994422932266116453495971931851478419882289381633291476282952631114945156549812292853933131814871582284587894941158291437761
4616632676925186349652265688729226489528823865592933938846863219233322695394641517253722281816168553659287491431781839981587539
6911535318468452476119372562229863264455353151942898565331835258143557351764483992498879837941675746141679217155292482939932671
1957977595942619797465963827976652424745657969511695691181938434679387472599647386616836651475456954471436848526127428936859567
8663369638269542762662163492633139976357278581759363785964492936612554786497765566536189637275269652337282845999938536943135556
7818439577261622883849138395316586297827344727758946953544557184119191234654719183849557338136134283541642183682997126313868674
4998726448878592551834483461641741535813865259222413742672363317319817889969142138598345969267291155933567947719793973633734935
2736483941872997773623149848264285681165794612729717935531627832978273861957942635415971565885423473631361936247859854218556344
8365783512194856997679568821182764299475592172723857758115333266595518513928552682777181583186413241889812972972575311639623844
3918395852933744791189962242594794433984975861459374868254296713597211331735533416165229653563259334816828683788543282374233421
5312314748874726716916198311485867282482542262746518335222323479865395597611138882665939119412453513752749795937346376218785619
4413469735156596794811726632667226599465981683154371285177151785343873573797812776989491128981472278965737515928612127383597854
3451378937323786994735519636773296346833571663497146994529837192333553557247552737842955135997357651672713377857523368975698129
8537513866385211386649154921325538136812468363292653529939164986519227759728883897789335342127843881247662512811865717737259823
4295159321838226476277422682483838434429816516751481655745434544434717295976121932189298336749627446381739213434272233794274964
1888953425746229483771363666242782829187349578277623391975733416257773747288831467244935992494491649846151125722942565657245483
2448317363436897556185999943885667218859142872653625385944654851424231729927868398645662936924258321626821418961359686731978492
7328726557498342332128945634861458931868159356542849174979344656227798753635956934379756767448924941272878563424518694219655824
2731556932324313797677474382673857545598138163572291453168689937236181388549615663162519896648565372645536711861651249994464176
4343663232191487279924462716766838438146591579366677987154322469593933638868222211243686874315355932995116839112218483764218417
7932891862112841839325119831682497355923153994328599565969217519269166953847796773729345936744148116432315768181244117346188976
1634317728554279822227754752586648383955449226117985532646518174176431194362391154675385112465211662514195514793235782789599262
3834612571444431334748711243617539757253464785761925639669285668558111129613593435322215722258118923485742355628823625791936295
6718615357957385263339392481526697334446479117935227837926424421511497721344148762658196914371153235198774143294715759469725358
8241966273577686565259285616299236728332375894197641644647473888832389248521188617884643956548562569732685399927263318774657892
8213539439672541735529337513411212452441644993562328672866284126279751359777287924121585169131219313115515776774125388559759726
4392721151493727974352365575793271776311519988929599636583929149864834599329312216357419175358585259324964757186488145948397696
5581182725816629925654798469323617981242635184694864237672864151799716331897671542267686469135549973521996261323312649666941932
5396493236523528824424171737575887646584631519522193176678668422249889713264512671735919381345717378467639955173532997682558242
3169464617831867886299698974557719358353144625979495133123465849267428476288796999999733445257879444878967188554548732496995861
3153895556761829186622864572273632584598673765258292316458497421145319799471311442263797866564485763691874965761243298393424685
6451641333992959814232415596861819329292811364795865792537713559886756265552537292189318675656221358214434692172693542965986242
7544731692499761891145713115146356161951988642357572664362266846131125575863822213493458893755967592413995948667379459346263526
6213433468134992559845655333718396864839794272128466268774734797764395682791863178935119632443644524815561712447786459955453659
6386788292181265385127431816683975458514626284169246532192676914446166431435575383271452844274288879499858772495683185842238997
8966434697341159167844863492139652689477137242278566343756987219137888296324144545339431428383765668948722724687776258886168452
7671975495629446243623218665647355271571358498116815222741777813849274891774193219445521469923269255951765169375554479978927863
8466812834436542652165571168288317317621942231159524873417482432845323843836643423363617923931349177399484955976458951896471944
1259621156219448846916914342362714465269463385122625818274797468991882918871722448932726254475795781454351265659984321971464559
8418965952464823437915159924679939431738333151719395144233557312353176795243472412157941919367951728663213933456545436829472199
6542138732147879656898656499635315836455958557593395955594749164431886126719744398334482291678613541563143312454175231757271825
4572144455631997539743996691122321989576417664269796759232457113319111744427675619449696229756821393558959317754575343999919647
7263326625142461933267792733861155144735162856982297146737871194323653164783428579574552271143322528473489452891676519597891326
9278964193641214158517495664294214412388229144752665297681593252149229875557843199531594852466565159657238728467157452965158955
1372315217832275228598649232484843812266748646268712423913282477792419786957669964435285262173141981299258355999756785635347712
9345755699478131615463394986189926649911662968926484395851284558692953545581239676957233134896789661175116781495368582286335316
1938173499955524216328164749674867945484488239788285332389878175265889577573177528519714562927513918649891424814638466474254449
9956479542262327396839722394174338589914551675321116151176938285799184179687828293656189523117418695348378622185733971139912888
3928291123485854877656188411587171424895376264454862866129979886796629241691394544396236777585366527434676166834288258461964269
1884627193888889344464313323571313126749733523775181747998472597782878643281726691312928361257243139569392816941564466779885882
3332793696975471328654343112952595195271439689967434178614798774915625479768687436117477414654861252958425112767992424556997949
8363247733388129856574464953993997384783818383913311725861461845449437781993757165298612711198864265327679168813862429847579964
6891487193758987311841794777192527736445226925116142224446412918978295262466566112779818965885279355866684284143547155692661995
9214193793778595363878227152497786654315511411822186271366696615775257127481161697738511539952831791798591313763757865631333642
1466273949537644398194634337673787714991782538318928725883118785549555145578781998592254739266927962381352867429312589418326441
4519885384387311338519312973538422535576728947169773578983363244999518884744215248858411642839893218328538265578749768284224456
6877397224115646917881242579411768342183682521354754891989373867912467897226178414888793111279921295717612534441941392823679374
6688247322834923216146676935917267992359138927999165671417644827877798233754317717358128779799224712535124768127694534468395431
4959357392543726672316746679827777873897843531168357862485314538935357321467676227694587393733241957118321651367434632297247234
3967133714166153937876356747697663115797441313714435731752549146533575977483138297797874954631522525167718728233197852537571975
3733747854586318298647295422671416681227471246513518155651692247442966274426336112336255263732923163914447445597866516129455442
1366352968429511438775627867259684155779382895189871585523461459133487287598999936387234782134525263699576993571476217171379167
4575944497545393882547488749571219385898464173452226265481894572546911161935745547913347868372465661954566731763921586389582378
9395245437466866189471473117894299559714869126187465677337953965498312271599931752758583595232613361471936617393473842773373678
6737488983214685885754427231281668239483876298456752611154486676854528961361741935634319695114475983888455438569242187591787482
3843219238254549344518538256253111547886332876228558426858495681193164739648232324451613663541827584245958529467527748241894361
2229334775362163675684555797758383312558773581316727458766478245181944117893444857951337666962446575567322276178888668412537929
3567386416291992453691232333955116731568565483679563342213459366774614396426945525241187894961159293418885628259539192866651891
7434491566373785741962585318983641922977118649248467812325247911523114581839223379637771173678476198768741193471461382925922222
3885844168674724873293486224848179554352335782285888384838569885376377536854253282598448664868873546439528271755143827439457469
1452711489453624678679467844637967781634624269915811516787567819155778336416126129752246744622136799258181155876965936647586373
2341484117295637779531368872787621931987473773737519266919822668464647312847181684915237143997968139339762745287776867567617145
2681559882771893396826717885535146951177923334127687238992687621919936541543364117539528287446126916945599258658552257983314157
7729551983599535361213816331949914712919855552819659851719274714863284338431961125692248876574423432144898924338274793172982823
2198153959876925462793735751948894532825857993153492293989875289443855758472169994995158622336342492948142569964476185544515228
2943575861755135494528711297872944494233549421456892721541367881388718161463374947896323216843621843842988139342323682671325642
3496385553563277373528533867266369831441847532943115251499463447241548596384842396644887625873862858329874671638985772124878762
6266174779319622361884892831719174686616539278139981271962982352684289938468322469412231337723797842942997856334974494182518718
3563343773113742562559913777385566645429368433794499356158717347569698393479296685662629124621551185543776648455595968595359996
9654584883582645998417674349617752789782929355931213642414598128114821959124964829951945325779877496491478548628261576323555325
8418224989573622688985119626732539798274547175918981653718756874625346184286386237393943777795541719113791667191832925226346133
7667863672837748388658564673294726983952181434189535373664173235528795889272469758643597675462332564941412545529268989974439865
6263857649839449693638853228438835349136654791983625931946397186269895492865737792858445155876249661279578813131384337746697423
2498262527252313877644339126694877593474243328699423576882255512483865359692115649498391125261716259178692327339331493969862963
4162884715257151549736939482322854524789726366882645778576998154352168133682771762398523594421746479767731423192233174742797326
5868742878374926848125163423474261184398752128172333332759532718532558895456729278562837893663156376678113917528289799224583296
1466284173554518267139181232974916162965714653622528216624119341749858695452223746517554455195877373348159671747723588448416913
6135326658279946262631456822379629654498865535239754638842175189222395173985278989587766283368577736224512789545251441618465415
5783487974479862574964471675727723176878534649728515566776576143974174748582319926553134619973677118542889994132725751296697477
3782463263844284954767614359933754439978134625394433339485839699512581246762359989426372813916648529296432713276869691863616332
3476752563262155263438156877877244295977537141175371626951284897152785491394263359523787311824719688395313454359295467626837766
8318492244755429954979264243458319511366212576297391519222863185727568148668959862112318871137765144711258263444452751871714954
5111838939196996734829929567651268524653283922892745977638828373423573915292885348929916143964453577766794544752878366242789527
1953679718512814624324237554313127944788362722523758217863977894798588396449623513582962214345942251645842655885946684372883278
4923397423514411294144241817551145446666969175352791737387171528171359423575367825166857851947671423429383865393879682718843172
8644555715347876544591492927219725294439732429427789128432755529231946852638734242666695188436423429662383552685832434711221372
4885133437427666188846462845493796751431422955362773747759332285917985374372674465476292877956589685326665933374445368149175233
3944917526881589747184585691456294728695472818828884613997355814715959318398575627551945185924699895796751171914423686349123587
4564251821429336237598827371383556161757489454442869354949967794128945858233294157329922812285467144825192232929157133153277864
3238478674562898539116917787683416255556828825471464555918141587148315139697476686426291375869113651462148577617919937613564266
6983167263193717737624455835661778512693931389664271296579194632861711944281411524615255989759461155112458853976547755517951831
2574438276563756367375886776234953427579654924546344249221823452165111332955621878526398311766379777173885845596168777871141464
9298629938484494756244878426549711644225434173458363319375312585145523434393643152854785869933388789439996355366558829677499766
8582377597768552987439843557461439477524325567227879569844624194136835856136521841123328392454531447593284741738679336424992198
7621637259839873166589647714625821963553445556998718582122957965413312939379137363188946522559618989656822134915579727984855546
1942981573823338471543531824782253464384954393239742439366869577932161547484524617767712139127642942787734595428495288296587157
2579374867212863582178762244321642473989527885952861688798154883122361454467963471992549145864541285668727739692246627286542719
8988111157951475921496633125659486416754262452138417713356872878859541189748577956347159466699176557813951192987363173978784928
6545959651756779684173496655345854691254164159657641798472115136138625915341747442211573529537483316132671239383678791753449992
2215544581374395368566138245115534357356369498984258717336452133588461484554256283339814897572542921197448797863472668223593857
2233115491395632731976424592361959241377216784381321835269589971671651253416341452984959454788813634917784656372118272122744242
2429841392996256843347977339934744325613726751143426841748193633615878235325765692131899288253311268175878512163243698859641523
2387532716668547844556554724736256637128616114672719212623237468935789449839871513467853534551112143444344125663114196134625299
1958312639687633182821588159348427378425241693269141196596829767696478562132947835673842341794896266652347856334851875388229934
6524592942365851963356455164423428749199864891525665557741444552941155263694181332464312494688879643379851257592953542787669841
5636419643687971587722198959726463367521525986975392951194524273252614593336867591393776447578321946625135687252154459563968273
5186822714114961136931965242179282789198568477898536462281644225238393532328535485278134664712677359331494483219296877834478954
2126136929723562574197832344129177834641984737541785977328947216742873893189986948433685366151235126758792831879643471627372227
2533391855128389575729847878848189296751986131749319958691299843282287894313796367733826944631979429512649366123214499875826287
8312619623583864593835366138732312598734995193753344944374912749128781631592567185977744383952932893651597856146883352266991666
5547974547879556944488957355396679721557184131388321386278962616515246457548447397759417863787132688163167286562372789187722414
8714851691297686937582349779576648225291352853112711221179162158664134781385437237568659445435199492448412257271434533773223387
1191777759432285298391574898387262246585927277413497176887462452386274349732475539492593411248621917361627617989579777343314364
1241149983613871794562443182922487584536293485435789249785882563644242256744775912857681529332348553462869246343723472885415285
5322778638754363164373755694614926223587157464482963436861342188391926671343295661766331726823977633627654324478588676156988557
9241745495176964111126694983966853562529646782752647328818136786953774768731186911793877868975821198518681574931338514654791121
1944353181531278631515329468441143349528164564697985435483854128291341694155941315692348648629539191581499671652126343469122883
8124739289877521922626826169952775727815438499958131347135879289574767318175176112883692484724776986861826664464289367526167115
5396625231445234829687187189219494232341153263884766495682964478523374852231672457391554111657748963988333415683671564523396311
8627355867394743213217358253796319858277643699899121141879699575763719125466729451767952133126327118898361791598553153741982235
4531776821492229848378736583389473246848978332466664948166642596284673935383613663455551989613913715389973424664585719282655421
5876291117694466714832322818726999463347177585348319173986222221753478319639746316351256846614513775135452969993323198638817862
9917724677352359249613428731825841123326171756259659918137778238787987222377612892297751786439349979919172916176853489313391538
2589339846815383869968734632161293154437533658634885738569367594784728333859979349946991869675799946516446596989924217124487593
3245831513381577667964646984434562212999862916835346139755296411876581931234712437244164987315755749367877791918881741858135635
4272999669659464582476399477535737876491439335926496546518373988745954774722375126946755327644859886528845735687138817349788873
3245661177661245179116417994328612313647569478373843626652626763643786892634189295322596542125614783911457145343263826314266913
1614545982438425236613424991931454495573359995334968931173754833851167127199382151982951432844229274531516696422139895267787881
8215518296176554711916823764923554395879252658126351139272484384122247136829346661937362844585224397539192215568268932964612344
5958861834591762488856516949771595241336285143465212423214359426828129661953914818497243854593586378494157664413661326397672532
9647281857938978761181761227984488613147591172482319759325998296791683883377424719538548462193483566926557597886629325351742586
9245713216461954587713178442815154796278451132671525726732513278296653761943683486483159434888476235858562277363937194413836681
3871832721412751436673471894553513519627287858893596848292847422212592476379296518352334852774934936539765869394132433914943264
4633747192922914959789264317426857356417837793533861689551911845774448724428712716887437486771954934659772844934478991481768877
8347533431876923769957362439291556243849543657981212185876423969362799553288893388374649133542779718762523139446527584424255418
6611324783416771623536782986871266588449284112194767453414597888395978652792592663769994313766146383457865134274351837334619685
8961515666446345875587859455533763192259243517183216762629611633525557358449349645963857268742899381527634884829482382488987585
3864629216587135871527236492167148873379851764614476836163281234872884573856554331999759167826712915537661344686323619416779161
5495264419118424135858547626634911364581747787731242589843419977212578136334356265924583663827271423339844348496466316625724338
3627914588117778776675575342542538156352273741695268183435293743284374833747771421322295915362436775269261179867456775368214529
3221541236582424796585782367294842765692443769697424766762873638511158129455682742693199724221367722587291942548169386685611231
2551112458752884234418725238564124453544742964733264378765263539777971469984273133485383442763497922334678982836718923229316998
1188573162314143578886757328363432776786335254773291567882822854691187165887574281382749435419173243123177786169917655768629654
7396311512115498177831113161529544661576323122287774572561751315958591194862334483911894553827819477684189327497434342882884632
2423774886927382434387364735892626257332167475551873712369188494252772228554678733155945722168572322169754845148996978829583716
4186232558254966878517531384845653646544221495355537555439269112495168932587172371321727466716853422517362835221631749268517314
1268424618971661857234758794743135233141874918437833846431984722579782131917132524676218581747973449486245945973792731284725867
6439744277814494311597675589277998586935172279497167323367558287481949212329598465728266189537746372594569364229997283227614989
9888457682256398328311292181324772319178892229864192752114275618791354939599764144864533412585335477644915314114276728486178535
9417722879521141593728358922879989492554684439416524316877233285786469519762173536618149612165337843277256372688863642925452689
6788419219553117735812992157573266656555865171619448844282415327717374434758352524832171743128779752855572895528364525321419548
6911329865369554633346964542963681315365463114783624785522319252218837778598627785967548653783613414214285945918324969582475499
1621161143677431621485623461291721138798544418519625356256985629593138788239477517436623464281872326759169833162213277352243866
3369275772153243569582658881876825598968412516416332351457259914964282637576929481424567522932489614191475978766223722592163976
3958238491438447955366737181196876411364184468794784481479263849865377448674385825325175294746554732627353286876396517152678548
4862788748732387756272131653551385467718948943239537256193199699887259786667114866142366498963616641814954152791925826838564291
4966558911926554439569488944297711122386269425436233289413589191343475322452982651582115378472658341623168247711636119784292694
5787963189219468814113564856213333951514687918866763848599338135551573739965486751462679323955582977612581411558131697574914818
6271869666162584865195578866936849983473748697551768126898575356264427917762795597248362314454323626169372816935917427149823662
8123591485911296795467473927681679345938126715564531291233551516749629476855639117686143667185459222988296415968313552457626589
2596495176873786695262512869777133341695944421857462121714294734554463657574396929355939656273198794632331955574791238791356971
9597337262367338759259379518955138967834817273167952195228264275136457164562922139822418195476835887739786727689461347316794555
4827694912812563546922792288377453872687598597957229283255324125733431312373552857277975984788956878875276774933594493849518231
4425345559798847819636559985823866853986891914891736748147543889964592278916468143933793676315139251179579525794655677554482966
1419775214175799315761248733959842282381935927493998576345674215516125329361429427288824458216163699787532236154243316514922483
9392729336791595382399194743895272746493623219796411668197778295179216837987833517385622148597949583698577313478657295644728253
6639872226732748723666945878664274186673665537112619497739436595828864523337925925244627239186512395594798131147311247632772136
2974843484156791743711133721627624366746212921885946687946236193141376442618981941416155514396486714318823923892531937964462986
9572932276357414289845141329932317553884373224289926715488879736363715283869899142726712255711713494565695262773254335212592625
5341678337635122691187822361276537465416267888585571259134447581126558894921971464946249243544342143319338841731692877217787277
5526576263846161521621693591776169645524411272151344122993647911752494332999417828247415578729425512874959588548563343492855874
8411656211379258398667479388412758618594834375252879426432955183796495226463274252824519237946394879148483556267574219971799766
5918684475971681385348954889879825142118698539239525254776467592818518966287352249482865113629537549995737961816594157211739752
8373661849484526726361168326531368466325973514582167113261926399923228941378417255624878575385957754615651557651557141581195482
3556392545546352372156442171432654344121893917781171513549318448626617596771413556466877727324741186626348134792626643893194191
6245836353358743744364877529468771633914799459988276561127169574548623623454535274545363331886499552425273256975274664325139746
1966348834611389881978827472413333337354247433746651224645366638115843229778421277455351911395577469282635325913489966796988825
8799732189433793623223245281112123769221753415448441673231142288229574428579895469935383944198782526539281114546978369224238885
8166844215882439438291546625142263487995859679977911811875518462987275426811584795881897294464215724779365326216748585798817416
6641766531892465647567581969362326435899329548816119726775924588647646373531814974929193355273295132834513347668941825478262966
4676965335334692587179616516297187251245344614372363576499677733439646992587654174117184661981943239381271213379488521484872274
3887235212266274586566644222626896847561397855898462173157434411398121295877671116221322195719468625241662893928132277558176841
3713187179989899966294617614975348972376774154777552245432319897987991727541318519748518116516596831611841639997778356323925327
8264578393682659627549899832817919427426433585312269816964244187518811454695831229459946837834723472461537643895112748156781524
3937749155149354799727972255294885275853998373787316223349693569155284546689419624476219796128734557181915122487871819454331522
9368878283522517649426936655493251656366626195413485144238262542942327857181697252495468238341512641556426222421223352764965974
7851592146249181561593236896466781332884314288496543467398882236327431435156361443113177686138625375858177758276737536396947594
5245861387712395651359496329652885336994878828131455396693456838843278756357929228713118928851876549862445518337132454396458778
6922123998954292529624858345127144343196721629135881842812535294159582293395627354187483817217226223454156728581468792376586425
7268564546299643426932922671186563494866681636417117326935371196614282942784369679468876713377187869996821691889845236937223743
6278423712713961487594525614619156256834274653916868441949455555175762853632413795668814353932562714872798518879545425484446383
1789916935258277875835939982744612621433166464929252583645119162244165681944463972371222455972765431126996791386353842931154214
6476953215663393627234217735711928697763631144181534427872593856982396435732271362558212784671587365147332215535161381996162881
1111788563994489332564129153172112466439249942831255717838968197659479322618137579288359741131955429777484899322724289165343623
6855137283529817172261195269134474153465765253425465939657842787737937725356526441671126729824595376421942975465563916712486648
7738123514976251793139536169211349163879158537754213278145734765686794748853738752483774926599885748161637971637541718482134287
7186352412824297445677127689341832393217895333852683647426625682532756294229491573464787298237594771124666998163571298571656167
6922746735345572615838826857441442523519668229245268969944749612126569189344923954374666682396853355315265134413275729923262785
7357895376416337291771145734942145222764153427683993973417956563698285835668122553857237893869553543244948616649251239662619698
5614113129425812248688456946197664497227394116437985878739319963411596268118138386234873579738758744677668456251842942731229692
1475849465219434889781896483886642788153977118217934599748699113337726681359887999799461183832531651936851857438188373412966255
5234765223826242263985744537237183621222355836742953844783196432648739833944627348424662923316467271772941772113376875152289534
9893562555593764559794858119294756993915377998261811171548368235853395195793484217726948944674713124694924647888212644821227855
6465422272312462881571412524936489247728131127994569122968486773144129226167798931139451489749564633753783528155364197988668599
9175446443414716215813112452552882471112628198928749242557799118264131973159222283295782345656572864562351872877327631237662795
2283262348698796583613133394662819275774642219128698698628114647684913525682245728575122562579731996626795617718972864641888414
8351413464377138829986864769455564287563768132253182155845921364433348165488352336183541397551366344293192392866384819219462757
5878745392753452798186473199253848682913239432191868897752697729888915837381499465181664879571475543354326363522982437954985241
9661592199979896937827271456945283971935245451535437224338225813765115219818218314663855554976329826637164442192863938642846124
3183388968938343286324113984989125888173225879795387416791737916618582219993744469141896238517956295251984886611854851291991658
1142475823414798529954642796239166185712777646125656123783111634698914367761949578454748624829452989191842452292474618751937431
9552661249499814434556242646683887588255233774622723614233537338365526752171965362674134713562819939398639572466587789927841777
2321598422694368732183241114188615212642224212393274374614736644726668831511799479795662913131171937257681467127528283776188229
8929829471742534452267661975496164544342799919657251392935147792945476859897579943194336852494713991344149873688682586132418487
1989733685192115499693313816346465476925555735343988399645866417513635268949633546596229537768463255914398312683775186528751824
1172893413518141834775556645969287542516835243975828368636462843967858256485898574669944383252851137149971496519623968534472759
2159577337266191746583461118563125345527782617559924948321712148618233996543813629437798432152815298964753925158683951828795774
5391892389369553697615572712937932541326742696949583931682914644966481595969925231133666746567824671895696152251127128691879831
9126246946255312331933331138442669351893776552697865219523728195151473416857635632555973326843769289119819589969822738699722558
1649662741467683655198283369489943511354734866737932796592378599498555982965971862188444894456348639866913738771325215541189361
8358919385955888656856884598295666978796193854584127597369771779345946446318647995394958447952533745527659363548998667144263258
7211821723444831686388497682842155647462935251425872853866297375198816589867951938317199761714638831248273139211761695179996693
5121758349281879153547248162562913841983766545672585882858816346642554791215731474375118733294937267267353158324118696627661974
2154569115179798499912596362328899731166212925939958926488836334354458655298763483126325363786268525224481376539546959622159712
5993958279547752744741213651276763619357674321453825344445651128599955222751393874996263899852941466465648256599916759371318252
1871298178677576849916735821857387833892926563645642481854623588425884786911878311574234868224164338779283679572659952584796227
1755958998222459656752797624372419374314573116814376755982284845816745742422254442562761225434822723894938214339982495791411114
8282129584585567637218639931313617217298855685441479914944695932176127795498338352756928519232931256922379463963639534555917575
5979413193352639763775926398851673633326387969897893332825479839984171175688426588449364114115443479384757198127131542391613871
2957819862868649236546567415679555293143157747344299154381344443734517582645782344286227614665922462584454927586393968977131779
5134391917815667473585641687417783368749693779945395892434378216537846864651113331191738478157437242876775565713527295813948454
7134584539339732632554282566288443974619873665122747177122896686525551739295774775927473896392164335559239272645493166528117658
1285583894621251765246324999465455455586256134945878335211867191813486444711965776822583494627579639771813268756168136971185345
9236641985316784681828884276356379557515922757928258121921362685816467719397789461952239497678597449298674581599697375592621487
9272458659283569545897334137668788378761279378594398722795297978261616262228892511724158769299862868578911279748316177178626164
2121357521846259355818598833333989639381256126874293791163139347558726416184499831695742745387541347853214997118184956761699699
4749858388799667541343792492732942225953142164764297567612293292649646885839654286759834481175442338828692149731765916771752854
2159449183916823627471487778817984791748315982326818216553535949644644124314434892639897656392916981313541825868865485876214218
4724967568824994783324548746236112668436612993331799826768859891617258773465918928649226126462388751261815738667641871715299343
7398311523938126645455163485552589628872714969495928425153758679221441113771835159448393149814386386657948172929811795192958699
8923122546495596673896746213628185514161621975664185161567154147619949263879725716221231352213681424668686739484514827247675446
5132786716984412385495124612923628876253313919345424978763832517685958871687562147755912658916465243369262746121549595178985816
6632319764278426857211376364668733711435865611768416862295274611592536878196814989439148511172573262163983665473716252746926198
3178847114435273959429943361499799173884325415834362257357249134372849828252769645913846627318744281938826858978952489965942435
7386969569156449278652267534762454219622393627969994169349735647955445877159658494896299282922491279951886188525325535822239841
2143522527694874863843621789625125673521269418496674969475997256488453751444985125312199234327776825838981574539997696616128736
2742652165787915952543383131394244929276518732475555857811121816868388171734844225221531164997996738391755177213216298477878516
7432253872775229457989313326571461189896259453716828668238275637825859188688472427228161958239782776884238942364742172417328969
8811393824131166138378532319449346932683312242882579691444563533872749831965223245248581677835483774179755585731942185291238214
3226134885483979885812916866934534534873824981741797879866541518438933386685457438914177722697873343199398634134231766852948438
9125426436987128888578985643116561413265388388921229292532368597168553897951941388971245536112919176147624782835295956924673728
9142351956164716762364775785756879614785894135478141666116369647424143399265919128245546684252281252494924631575352365153594419
3459176516128656762133624797319148154652124185237686679913214753424185684486224728898746123934246948242427417446932244677358714
5889211813715185356467458239885771619938943838793845492718353949178495445273913418537947354167868211311833568927496844136983979
5371843656371518327646289947123647959832222918542525139798569793956418657941392581982844818594287178639235531442772322549294889
6638958622656237343671573566532194556828426113663721614471321235138336267741792476236776644863973571212281681389426248323932174
7388636715151565944798898613873833321628385121685967396429947993429892914222785994612961452216271164712386883836629869743755638
2328999597284943785798638541421655495637141513452522575543845151937789972938392536257437173771878363129281189213592527578399773
9556787237175452547856374495883419361686525445687844771323775182849657471194127713877288234231937912333847459436385452512736221
1388698279485313788373929584143951641777498956761834592372558791714363764366752432133236835478176591268389831876262522448958433
3273317767617977352447362987356517988349516955168282548234882245255756783235449254631644946929341582111548981582247889391927857
7819676929621653618399566635899183141926189332585366692629568529991438331271463934759722968682276823617682529173313582182827944
8162199354994362484173326564842194278488325149226458742189869298764825523261249153375411463654253991446289273844243537317122615
2334634583324762136394373322345166256565666997562768682674361588352896659685468171449338417564745859956663821398152929666455719
1561634399344989382184452548788643752321416375495127478291869213711168523223268197636741594674119422577126674845529312194525525
5913261763623243498735571764171435683275629163865116216892859776935953865837828575132383198287333766623218169583148241264319591
1954524766664857377227349435623935622988897383696977787822422829882438967691123878852213491421384851975233797472385492359642317
5937922376872953349971772112992326668876381893231444113491714961332254958559132232187893749557496795223162239821241566876775483
9766712539651357637156433516661411912148494396345817451299716855776818683785768215163797845825494227546384493385164611789682568
5395833363333499171582311328255521227682289624245497925731794497493489636624959749969815567974898469292736936543635249374335138
5343831246373166655847778267653473533347732711618923788849229927734598949512171114879872398516768817525621491434931448341211566
2158862616273238427636282743815992724146246266683389577921867937818363446325737275295584925592834418356891345737628438166516292
8217256726544853824274582522457512297343151348468377223381685394781642511664177262816786482638292229627977568157262952161329116
5988394733183376164159174265538827239136754325897231919932588746684882937415761824148227228819466472391439722835748483351278432
6671713614865599368526839891643975483698227858993782588793475935462547981391214898377744111212379675641334721585678138875218934
2725324574685229742769695148533678138748319714427165966524977793947753424676398655545534631828236945111281157484678627279332265
1162855713965647377534628781744399672559422748932326678931884538716993855652745564388415278828144669443694382361877294671387683
9166479948278188472694121776937539885655888973514596247986578115578171612141726379656374666998756812864121462483431772699675843
5782451889253385675875159423229584251397671715565572174447848515949122225936585834184512484755632847998485785672594597637924243
6819348337129358979246345942797866586118263332328393515473482799199964813341941919642854926724216754947552827816116314548925488
1136389881367488796395825841637973343433173488815566548662237314388677674421469868747545644761668882339825671555893631814229834
6968749623836259116526654478748886398327177753397973828972126686588633998644969624451431638236516775347669972371282579276365384
1814656258665938935778784239898315948159143951939389155992121188391577522534381894968513893544341781925679163559928186682174318
8945772226695383131451126885831534742343859928566769117361858814862164996823919434523323753544539344365453314695344586339387872
8165451764563994976526775775669542597649793431934633269585598376331177562686761488561558796145788817514111443354826327988149343
5118384852814236538465878177719112357985488692143523954164827642638778531828747668846112647742578863143455886721358579812849477
5529854952191359986994519353422282265646826247747854983327339326553256994143193617843597617987651243787951648783679352575823246
2861327899215122278782572932498931843694136688723818465762262742938261736662248219462247885783429199255355634534112244478883126
3838686366322377333684783379968716317564254586873177777116366976938345867263384824185446334678317665849885757819324455582427458
4385693116774667657879535718933884291161559476927437317493866764771696766642753854449333485919762812866732763924652266117551216
2454276848586586688419389493143146425943383711726167339328888114831398153599919663274732956774294398191216737871115692821826839
5298771269588581529519983945499528116833114948531948461958194212823253892433283765383828595181259273916431775486212932833789992
8433569822923821745634379879593552597137875981927644959267246471485562753268734815927931471613714514127439177763245244712369731
9199696448971844778794347449343253435851466119269391897972997563528922674385153242275252271145996852476715713359329894784765575
1231269626256765714836519367848439735641157659445279914467726354253138578782619497943255222596384373978234134854638999152117419
2782657294191398866422689982952728286597963561736216217515454585547119957957869959354879375796467113938215422986354313251744281
4385312746453324683497214824622381443623395446716571253145378653223399582263812397993945116271265893339458159325512852816417545
5466664396492219841371683497739444425781317617758747976349861448584872557424164355459132877595585189855434381747556143236781368
9433259273237764379827996721183169329852158934536493887452487439726113331821239127444157832198245983224348569791344677552217691
9878748914552171422399136893694172877439697758329756948426515766774574419593335982675162224275419814354647992481798915441695461
1644976513778174795935519687562225763674328792316175917321828724886957612124585846448788968963176972532775565464249634164476997
5167695789988362977519874236555685238684295175133739423886783272919222851818998145667922625718992191494727163429549472383632856
3282757158891847668581887928346137332762861337887987456534799873174952176276957622715568968887256186819516643821242849656951686
7643567496121323695377299737935743427773963385335774874529813718266426859689699769123988759814882871838315134457844693318375433
8885661269811866398538291371291949353294219435343158338545967182676391373641922281894639437698138688631418782566935487796911426
1792796547138293192692291929142119936981828533133178462964734465838677383732114532473312911421159492243652929337837582225917995
4283778641738834618978594841861443769584987712112989119465996618549895594759845573892467688314314794394282213993367857965888312
2114485338769625751682131177261895687152186392781275892567344721655639124296123361122975678577976832275564824754648986555484449
7253991236623683659235836488468525919437244617755881679129548941877583719487366322569677176143388485821622287688124318469592466
8142515555241931828946716549368543286615842368459395228967494491954476736512525953163886141629158782968771187786553912267738319
1432333255641655857453749521644411486135743627692325539421795252647419521294547336512534438955534367588591834464258957231385144
6149587533856276791678578217321412797815733534135693617911747218436728144145934625753247633299217222821734952278432799441286822
2771514376386953631216152644482434625254171268277831937729399866443883538345551773368354811658725831941731544384144637896574193
1331181673662434844556178187677265691878572876837845116661946235562399162832473147225516494914767354442952379982824127232358126
4865969671574385319193123117637263191923442843398658546739148972141383483935995733772942778163222944694528314395495228493343445
9872685427352299191324124421563819519179556418131519173821185168857836145436437547264356296513168955632677413799668829139441365
1861121454364654471648264474232153499842253999647772271382848477249699732844623994546723935519771384764371851583874264472175175
1113685696929915231312981973392464944853598611475789369751487519653822125271941257482867949938121683165397394791713366713788693
8741257495991377711735388936242998618685314823813518341688999477869777846317135532361558791536498812317366558796645313132734731
4385732611172463491231684228847281855476621688933817359543294898747764757666862668957756446832728615911413929148498797246954241
7771542832173671418419425427684492635757746526391581144662268587772188158937184675149342517968136562518347877912137511242293557
7885866362975252561395652332138578361311612626735518191261769457951832394111619991511267643646313352879919495798645291389657426
9755834685121695149597263641291367289452971761699248158875411116925118899317125548826536788181371278597234932818256364623449674
9784862627996687989392383459587777938539844558517842593312798833124171327931585184728515341584721768526713958252523341257125724
8124379554692164853493268451168849323182132494618655553179897728947324669983976614636828892374126971852798923686976191362939669
3948854219338345241185382546549121548734885499291694881755521695346777291916158167974249197551656245181979383631918552876627122
2429141638959875837444128545531677498493886891155835118418352215899932268492818992848339467169965187675593442415482394853931356
8976192988139884983355237682979612497861835788312269149681215413683239817742879688118213165962944784532943713663324631684994368
7832442993961476631146428495416342847926853834512859315113556465448487287874437269866132358353453881922884554221419418277584644
8326278798257889458892823576622511184273578486717158386538691764948112983142261843917444937168262899314592272118931526371648411
2972778778516839158561763718933123586675644313786158518268632255353931349323198191242823412379978871449257544828991751616679727
5132533729898193177834413888588655847793987536488468483553314569755296558524695351611972499915957831298746874887522949367946931
3129634942159659111282381933567449747252925392436756551262187172212358673975465942345825414166928968123955366279864753191521912
2985525721978368493682298772967862286485861819641758497565625922291766228781682772233155585944211524564616823421334471181694838
1733562744218891649692899663122397525587724375337888488616424771888872896534217265859915276935178578972739254139949637752765628
8633432679148147969498151168477713819538941693123184741256858423556379745159391329853614537222197417359955787517415125866771153
4919751529129345913545414459357257532954843388399594721655835144218962259946696116825287617975216926869277286518161774882159119
1286526266582779629835388553951789783536747495438679215763721614534925398181666574145355912151587117756868115975686776339776792
2416368652631428986771452844465585991497943282224835782626659171236374671716864429688765885657778751191167518158396888923343762
7869819519264723776963942543773916215658188927196641585687878138514387913683848298699534666974269989347173117475786595833165929
2821829679751639233249563253765362491337353885579736197887748189551478636661712612339968935232941552962112253343615213235995811
4144199171621839821298158115772734342381281519828268995268819245693394997829194182546274912969749297861375775116239924885614929
9354262674685486276246195367993969315341251436455857918828588854489681571743633274328227193183572632716513162626153738943948574
7941456921681523338591434835758565756633928126942748461986122349765696139218417129667959556633453467766637377967611751587192561
1354853693995189586288744785231332554439542612831173424173698786788258359248525151229181569877963188453698919323114665164676957
4647741797118496135412497473539837259853939844718112493183991264738849639992884555719756881148448783662773138914462532287251885
6714829142398931264559529656618198775288255518996483824175647999329585222326195243688212675254561789763263891376294724485136836
8892997156161897281527663386981452927222856911891378986499662638173725168891524929753479262713641618319382313228858369951911749
6875211479325713163989242342569624927417343967577524598592754332356145485494581747572256582141772612341414529848954545333929353
3799441355879978584448282899685383357483171623564438878981595942995574937515671617474356348729863182849491877797691325136986942
6952291644936615791465631351866813553897696451451166389734928296357599349359214246583382626344249431215574499963229612264947926
5592686936753915578938399746323641523628546979137159728374475452512411886344595458323364858156578892143667324424919558734456347
1195848989134463751367926827953718472134327394329459541686435935838855241772412459189552768342584283514581145982346575874196975
5576959625613218566711635992563349592922158398927723627715465935376668289914532349371365955123422298961311854434655585639743322
6715355162544281374229565217914936823773244888126545839431951278263956896398919884199664919883818386622746224983814148695772741
6434774199572986175141936346331674623322866492519728112942968188785852856345386359228485622551856858963914547924619427858151583
1614767673269596752317585591633429581677417161716294626565644749544176199853257716285623622763115832929569382158928958827394733
1499269845152155726984714125157868391666589811995263617655381673625378688373975288896442511991385943933289323521921748748952917
2733369298914699799821461259768533392835693955956144118831769433724519515826226638985212656577752967815744179761251278243838398
9349428922456715343227287331563644526953332761913711513256348852396829376528253544659537261597983424866679518119483219822794963
8794537558934424268335595441973292777298651443774193776222425639218346943643718319334539294569581345787766943698674698529722736
8662134961549311764291835595917178699231953446948372613248757975486352966761527799417543346169835917817198373373221165876149844
6589991852634157844759148934484833128678815667395582673774935574952481215619325247895696458361757575591914242433331911932852397
9624895513276577378224987981188115871565312499921772462388541459755361874621319394336657999234544538498377669653616599446172898
9816878228166336198825415845229557486689249816822571468769384913791193465529155294335138733443319615624183641967981126928837938
3391424546658565665286318366126961621643689922259257233693443469517435459725414537264348744276265828589325383741944138343881811
3886333987315344993986382831899395162423373964373577144855449727762249475662825285453543843365788538963697363539373845166331369
1265532456872342644593648961457642626937192572176298984271148298714881381462314233492746914625122818418297965178667476792149443
5858911631481529831531962612445534458228734857399745336425322593812959454546128681315774855171971759615464164977599422595673715
4682132848231312148694383218764211963967815281994689155881835641767128798664135695364226355222697877974727684784466673458559511
8791443268542759634857485814568742397268594758866821486497745735994896747962427162574328896736444662832837555967868184881282192
4228232111741379597411613611733117433751431366917914523424536497179394186274118332261341697273832141377738584891713527512688259
9245982454633939142674892494832375166891442527749591862275718223529174964575358447796612877141328922212243352995846157344963715
7191919349364975377576686624534537376737662793773626892166143678628933147676535482759936712483486931362269222672926892629521487
4934558339173587279253292575364559874641669136852472617681699425523729835829486281217596266441152339639366336248446668458574369
6147993695668927819126644786364465435421725926889393716685419132941998292721189416395864125941529933783233715442736781927244455
8795654492622856111318813774593165558488698428255379516383276254358997531811632355253715887999639257571473979635795791516374996
1466485523845352931427297158913328219177823389514786115146129836475564334627983345463389969544712782465868663721926246511665643
8553413357865567498497923139238479573348371766617795568169929949389868342859657277424194415496487982138357525321566491666313878
4614346289431555536357922777768236574685987653728286816717163248923223846849571745728159573213681726332841719989883177694578962
6684455323913513381541482481273234553138594922695266236843736821814854247624974313161953752498346823797761466919995169458839398
5122685174555496436176577956977487294998891588579439881141352859193833562133324559446391323397251616988435726745835579385695382
3417587439485436935667341249328469393517129378686464875445765714397718662846893117757923781113679835131936478477777874212313454
4521326668537134179398397785988249887542729239278683183639348313547676992315952926238168879763146598233557645211174111265731548
6851114991775178381998539146382552276625567537345613384143287644251591515231521759955267824357149845147268257443637925866616577
1798573643456862551696944626157949838212551793111743926872497811596564986444584824138926997874915933526785676664438498246783887
1976385832983453687881215326743597432468745237843349636437422859357391564617533283723491155543821386755222644879221465577162566
2926992995263677453593876241353935866447349566735563998219626277435762559527133196815751918537238435363681689955623323852377216
9662546252277259167842372841493724467979992914789626945222283254351572728644421543524293995911473629811632485639827895357739318
5315562976937722476115726463643976342643148321541987319967742217584319526625515383547676155432682455177128744128682266648814754
3625846645317579579774969227337173643493811787136792357563555199214958818284319575267641125996833992917657758575974271126865792
9859695841135527162478327653915846997959676685988836247375142531121289617262756844861273685717742731835857681578928988396838244
8524441481127292353711624914697982217922399578161265467344175739788431413841421965561698828814511263948372187538282774725419957
1783362793853246961891747234786536489959977739638637655979171734318339146887643529463592536295458322355988994393527742349475911
6494446444795342492344986817163511561786977862911634352546242843792874557224942621637554989682533924619511191156114774397398476
4388129171871134311116637913931143721872327616566855625698722351566887451867252489899532625721695172541385339741366747173721786
2849415328539627263188617617666452711371648211313311628396853914284116625528236398954274521961486725867148323254233198523184693
3179753912595742848687726555646723153487646264816851482743591625127117123369548989554287279944869789864796681672864117727688268
7111457582716987362523312587137231869345963681619523528698555328938694721314351576286972423513618916518598395273294573954899162
7527663928939937992682992915983831116966443579625389269621185419971612268213839539766912954642723628329128476148829749687776856
9583449588715557183427363234461947456477167677794364431565559637487216414577818141389697752228976142763249465963188617877957276
2364139721116485827346458947471732636216475951377489585221558355894644435777716558638721648982962584986848629218672432616778336
1784854633138272794483389562639592456644695112862236665227342644168686911346146879592221841572344693887552896285268771994462128
3914515257194997939339953855416832491841343631653484277235746244775752117664441216221848964628846436924722542155161268514851853
8894932414735253169856846286783457378139619794521169391688614483318373959113531762695478353284817632513411622237832315996734434
7777379421148291774814585728746878759967491452126793176559279398898955345216788672532516182763474945264926677752972169726716584
1424476325998756786916771344395426581193716927565355998192894458344886419113311358483931725994531174511594182284894428774897998
8167721272899584745236961171175786471267461222694983384889618732776644633947314298497446943228926554553528813683279667235885667
9566489264336425374461862573312139943246832861465863688178851157142568734825723618212166987921288295822238465784294799573427148
3914637897657459979443728527913723315743737818749952461551847171462981566849481232448938194953571255516292998853427585479559499
8385993646899745347931562111158293499412123657334958479679666758155195296131679742864914781732167781157836239454817772423988679
6336384448916895493589362645612229864881433419662866286597413956872218651728632432166262858645736881286862495394357354732435169
1718193568211969114495368714414233559218322867494579827729792759618839159952816614614381595767529437813995664135499412558255653
2136927855119825351682289195816439917455661531266532786859933178432875914334144774236454118159795711224783112534884314695444258
9875696725298221559411354826162422385325525857411881121223529627928427172224942541515375539489943657797582532145674275912272927
7899584965965281137911121256555718561362338239738329832718425323987247449651645379142862382683568942899435275885448879526327115
1242127443189311275664432571364634173444511283271866637259348538882157311778744339926736619295825331519326414547496484251443761
8365962832473525183583629384898851298577579837256785161523372153977631953987871837247417598328968566441737147546765878548458963
8383931984676292821628297722555843644113245844945674489991927277511951497863923992524743721241134344937591865538865492915721879
8726644951215561331473269887749837219684784588495761154533669669696569778151539488174331845667443791538167493236789812928617185
1646362353595845998283656621879435799951184274237592574375139241485282179343735324336994186618629315967633852179368777323758989
7763174716484645616715989322582445761173341766397268519792672179543321427214235529954587543733185496899417535335453518843832833
2978945884287479144143644981964284886668195887237441588185453471285977898521118379986588427387286163354782765117316482798135572
9949861855782455684723166454247662566916664978175492385929577832177932249319655583967347513776648814817322826426349186166999286
7845157983257315877193416455355718993388137219942296543773349573329511862872418593499172951445865132122724832656124437745196169
2398331651637325183974971713835939313325916238637726729537946367274829948433517154259643663726937964221833323171766333892348258
4127299718166474559554645231427954337379375535736322326988343567727936865168443928543861633918556867531418751879217198441261745
7634431267342481412726187244125863166193574363647488953564642729936759517434591566179286915295179361868538291541139169941418945
5599837723446936652912928187737694698546897688313887952447181575237523757736234764722769372933491795896149362128469987784783493
3466691175987311291516174923266718452899176643856442925338231636794584662895633396255439884453822122441599315862423541551261687
1769987733739548865817555448268651474278475474235181513127361238467992135568332788866539495722358877945386949949628366918218758
4172627963236193599493144166364242344171757718878653141375883633356217797923749764954428754479515659971462841788136287124885165
4567728814227339499834472899186562548394419222858432261291483182456982431514418256258231176359576786464222634245755471338111963
8177179396589513629398554992861279622767365311989731959731471581889286899636921239676291741536336264344794537519988434811926968
6474952448762154697478874338199764178872981724362458735948227171649771686428874462477955426725655327526431379383741842476591114
5237472241945739415433488968384369959244624666352762719147311345833364827186491834433337567249694647856435726182562256441626685
5923374773298238258929665274497418977453448246786258557176996229833567911931111539689466878258431835453191869614979739639846982
1143517144434991913461581184521756611393749393258763282269886484417171131465879243814449575791234738929649311147398288812414633
8411214767936766843589698828416774358465424267854527944929854777255279162132563756334434788936873635624795128875154139728516687
9746353721698693425343952676772614256248843224844925372741472697912218327424691125445524667221862945588473435473511847733788268
2724793559725279797198968552977449376413262183733892625541228692587536928342937665792344761376594578594378449162555473427514675
1747786222477579645355172918842882526555681156938964274994325944996897279279641422878775824214379282258797518639791143313755739
4845296577584951636464345553189696546292175554354991769888834578998973433681454636424686684315991142213398345573846681162524732
4848398478233779268334333783796625215515353932144533159856562358391127448952658352398662568954312416552115696236992953745957826
1153237268195693468328681599731278345157785264642637569336235628521971794417489731557561734943311268736374442629851672933776125
6753448885798215342812258677746687592171614569767586466764325478822153453414647115119951188129242854237397583577343187153388165
8321561931922212973173631382945434321644462764587188922839298414627787513245933374659876262386587969574564642295999176941344667
9378322496447212638437453457185342748873196431768821545393667587273812777121745515822567571656619461872438725986229268516196848
7116491914291445974539433849617493355614546257682756318131189149424597743133535763697139343757368264459955199586955627552968751
4864521237365643757382945245358374484553174356733556462967727725814987172759682239112895236493567557264824972854227511615574176
1432761994556375183444393653963397163747465473455631149773465629373821241742536659986516179732463944178289697151188159256912491
1271484425484669426644779611885988417318184598261619595739281442567572978944336589741952615935931836289579866469434691617265729
5421338133434556135817932851138594847776184329641828386317438961219915363835434885412885217946994542417775537278761597887797124
1522548543242581858835625216895223236184871242292979685788579894597643275412599393319319173298718278952327761714512784844213596
1658381663674359562211185778534911181547117766128156558429287721838631139918651834714219339591451764355693834692858597291441426
4199986188974618657711296547994672596938241644612691824488886467765491799619381313418247238449625647483413634363773347649765847
4588745212126233925785757431624417359242721342582852826666494672671789143538559232466518772745789436987246336234475486537784129
4931997853181844759867659632928922662553162747166131894664279826884433878964562636752654222146884563452463787852755689743283399
5793763788443766785695378851827557181983355915645537575413485254448941251192264514642938176467915961324368429347449386379822247
3955313311955343219744499816759946657316187212821342579143163944475665849235779441275958428747882321414168435148548547222619213
5696691571795699391925155117539811694947529666773444386266547383279654469912596451479714187656487472732261273325154953276753876
7972319994868521936563987713366753751293684754795434934812798278113394681614195668618842476133527243647318868299928345971253972
6619479453278864395921743323128119663597931944225963459272252765819828443442739349798782592566529564932459882269142388852986287
7151486873573198524341877395349255279626359787956616412818516225522748757391752571965125739631947414814476484233188494151591219
7878963289114317258355969372321955317248619797388667962767391544613692916395143247497325485785764285335926292948946934394173119
9623735962288671313398729529447335733662881869954848382639244338592613751366175262882715887898188128986633525932797795354492594
6673715944461414178967853453597495886439972847876535684135948964612554342246678136925219661236837715696124743895537379827387629
4845614818435284844744365229651714458322681795968794397295454429316391128286523841324755347981751596769721379454897382662282911
8866865782235676652877175241919653851778139972172624159492828382532353123668272716739249511884537415885168757987617286523982416
2847314195237365841378321933683564171183416513543115181774833775333881743537573646222936844952535752957392692924958658628734998
1956425131243296935957735629456199777144641448556134756929111448555216213768957416183372341447874827859499476571981146918677666
9259154154348381565149848456387345361741957482991398992679139987698427729524485963146416427299528784713612462872193457566234857
4351186554145247895534494494825788766725542428762566287846161773931652333697224726837641491635615345793654219943526161765574546
5976379492677515726313614325185653274298459344228182522835225327484518268927272197934835476292487366177379498267287652426157161
7558191935612786424282199388971448742749216684941661579161241253518431597438446376973315877798926283587349537266188412363942951
9363267566892521917854669475271767129915269914522544315952692254321258349119274818296519995375522429815969749135579977293783924
4852525927789994337149445262517794851267749136995881862187167965264529899396995298278294399164482124875967524876381166983565382
3759883489453391332833912851863137914267731183311134914822894949987111537838762859241482514975714995362639487143225261942549562
1697614593284759875531949264647811712372799192978452441964828446336669171187926818355843347469217179249944386931786779228962892
2589521767733737673899634132285958881358628956168813675975484338396867646368521566871884355875674589278455837464299371552666349
6642926754695859588255193497132672937778446317968576675979239683316114762314592647811636187678474279994184135137821666861288789
1873561524133732436673873121433995967454715694832691646743429559973851512458562231543729252762123454944163688513568954611752686
1531175578617967187336425182713355725288387849366581591141738822227291598892489262727111624746165872456177861958129897243255477
1544988361526559236498988527435224786853271968267147899392118528823614299863187263533557114758316229711993923599985258161826441
5971421416259592274743898799366946922583965549324586699988892628234887257787646484241499476541618318271743331665361211931862525
2274815993262165319732691354934223433922124979414251449386952263771315284881457162352911981955116252154714445193529779871982668
1917724937218984388796342431823977649615588564759148671341546155865173835186186281765853541954949779649957198654771696879527328
6789971958177559663972585771294521927817683292113998248768995734475844738471982829242336418738867655718993722753757326814858277
3136847455137886853985634116783828459622154426738197514342169863678672638515126548874985542256433361284863266964375555988642241
6671657917866112613583626135989941745191443946368115617761963758559976494874484211552436483846256243289425915366445769761463761
6961763665767139492349657986472283959386225699766483852219529393761271147628715723141669625176623961773392969631389984149113999
9435255683283529888953652457635913194383295322796162616899294653318293959622746999926614415462692949912213175271576292467487298
4942251188472165965385972986945522114321956886624751328341213162245375295485738817787617484567475378492949879142774223579435121
5342665855366279824437992147779939725946713628685418421842326548114862182953562969457519651435227694144284917121372563136589245
1193891814535511986429968932761178412955187382235272339131535571566266855312658973797933818349572246996481998112197591272587322
5713543188781475873275436581477126228256728457773413835228715626176119686463417321964966887936341332693693492681569924223947684
9915448612879971461748979425878264415188635155184989118956491438652139158686248423247658833518214984521486552978982178498575369
6579915665219381176919631115796515257333555372257459161965658381362971131555877688456129234294197323576676136666324582288628219
1841311413969429845378792567541738891632164346753857398173192663345533665261867221429133978369666348135619312484222792721682673
2877279894526533423719238941771154754873837985313255271742747277786875872884144923677568679247977753968638874833732995944717264
3114142665819726833911298965894488171214313727688581564571516118789599998627849546218482777893991361222816766364534592523699895
1727827374587467563552828897677678326668132171131461962929173155412663854798994966145692663556172227282895935117345388176456211
1567464641786596689841678946815791354584827443919293226633983441484878767331213626418483486729834749187548155722191894843457333
3123978452234772733939445956745253418147837798387467593178842611894682428234331413474499183745864791258817482327224544282874683
1129211552561397117845814636733992454291489385746939845198394671423554936446586218299571732989127363244272298916454592521495794
3174857364925766169375767814216233835246818351836315999693972757995453237767548218272694268339214351953512738965522678113189394
5189421516355139427498866259955336232519217686333644885169793761255765182595915229267993452443912257226971748143116522447838614
4517541868548958782183346358713943445419465627463195382363685317272449627937227584448618627185172824484667367126879912897897995
2525879131897288759319427616844332379524413853559461699771835137271819125858298985488952768952333964517557238396481737576461268
8416868741358398876585537751469423469466216434657243721433182144657639991829468771214694669786729415154816469927786895837875422
2566336665873393798492656712627538265294216186328333236668223176957263594873129626272157976498625451375783184738956827266866164
2129314465912436879855465411285835619561998268595151288115959634824484695574987786146141665618223116544729186798286861339449634
1423148446558666377387134336983673353386255169511538122321345134649781193575482286981525376527788735459447683151223787185555764
2711157773984186993581763112598762493824974321385525395296458335391339299577639613623326296785868813465391774876945449315628678
3221839739935521585668695555257634647355212458378468916237968846217215627273786587463539697722285843826957189895127117592658138
9662377476154455312813768811227556941114366895515663967225538712446114418154518556691371475247383825598695115674519686391489437
9512294923258149792722642642773978175254266559956176781286228435688587463443259935939848511672228977511954128983573485427382135
3156855239146488314186916589742774113258881672295533293846789897743164926342281947196576769259999955998393813979963627636734482
3483428268812626228633411492525572211488488474871163272353869914166285191811698989555134396641626923984937356416617338285897777
7146765314629966345958288735364895185437731183238839947568711622626979831434656813233648336339473783793958922874841736192315292
6912876398614189184883678175879996674119381984741153225935687181478633514359554941847884597977426197765654439756189197715233122
3533547392722871457891119271737155464285361479534818258788453366788537763946113815823359656644311918572772268646619982492453298
3832537927688468292685139558164536772486315494923524448924652323487211476227914784741442174227231837239312741656154495523556856
8625571561667449775452661259121813125734191759388165241974472147916729513835213828986448889133169872995135552379679216137196774
6451243626879481675396154879148336438949587482822377294918741777856998599846173795774397115478694531811687521469713889145651879
4419963544322971381472591833559674516542852866626164569582644958987435392936456211968992691432135715941683325663135478129841594
2932992795885711714134455867552146231464251984743789261947751291274254865319788554411119629161712779441364927836315883467792445
7897732831351288974856428832844344767911192159262643872494484656856879599128369757736994633249844467952476993953399984146273262
7631192496736373634295663692373694621295758916795467725725491465955854821565271482326377113797148389775916496798858458471988634
5373731138138194813521314911878782161625828612153814543129597865272495556316797124923189615499872666697319946468281644882746163
5475664521194332261646111648546848716975289569482224449757261788443733672128333847567983845413584484354141841913712454662219356
8258646564862483918488333161876477932417848118952851619189514496445532986519875583313677156272835619818833251927871257574518915
7549742779157241522797627434797967344196948877838576959696739952332765683586238867453225641719263312736569667677571696849675374
6812574526653655359548666917336152445418594931469712799956235862642989584271651292828178924655886938519111197399737497767472669
6983996355544733481594939237543495968215499127645685786134776247739635694683765685123146155892546476299371568992188571611841353
2632455752731125642128661661292513989547413831817799714289767113431199523754466376955983918442312238341386141271667736174537696
3775923476236323444494847567599758266894853237171759359129689585881639874491942318866131754785222597314942754964614525583879662
2165472868518581194423927563923639884411558441896247162799966864757583257898126712583523756535178695613492668877682789199862567
3997691361338623952948484332373746296927556687234598642395794689349197846486347945233474528944111711926674379388465442958113364
9513433775244135842143284841777891833387954699797588739669897477318693449732755812239569893595853163917531892725121723362781859
6897861655591224778832815112745668251552348657743588332655858673732293826578123458745792282266319436965558119346711947971125262
2459344877614898199663416861433242445463512637953947117167365289726988661323375915789982434624975427344564663129943677538374947
8194585961146461553842194923771453243591174228789358759513148457566975477352457159287298518925764982353859861859498918621373931
9642617413496216157747175744866144893278741134547488256192988161296139294447363747141929322477988291267641151587318971393565753
2516176232568411636516687718373219352553382766382171155454517128636914851332929942758939177691581364466342129663183173345836862
2215197495355765775475957185711512544775898426614214516679868144311169386398272968162943955963433247871216264673949121472751636
5489583316924696671632724229769365526336933548477154377643438658511321196634236647583366212773315744344978651224564822436537523
5447945376228528525678728369447886424361827496723949863158743782598865991448522673546396977814854859122243446353182487522838858
1752933383664859141412372333566375442262645826888169516859953265244136742568624318463641892279826864261732371692524884545722147
1944792656682982464563431735671331687312263172623628685561992586172617347487733733538178737129877773952666614359935895712362683
7672163399749645111716416235531266623253726677337363465366689494378123424315399278728445395695634416529887787413194853121913556
1142536599544178726952323121583516248256493773146374861242614771251734729787743471977716326313582881989416147167854735842528757
3388427756872399566712578131839827479799463425365936421377376986882875144969842374299442789563228272719256992161223379528647912
5874757595885912473196129552621847568932796125342563675397777341888672874273191359524634553855988195216789311779665993124439998
9138658758611822273546969457695777141258263474914391397133276672475678578187328436435767911214559942198149784653185855364634918
`)
 }
