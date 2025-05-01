import JSONModel from "sap/ui/model/json/JSONModel";
import BaseController from "./BaseController";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import Signature from "../control/Signature";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v2/Context";
import Utils from "../utils/Utils";
import ODataListBinding from "sap/ui/model/odata/v2/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import UploadSet, { UploadSet$AfterItemRemovedEvent, UploadSet$BeforeUploadStartsEvent, UploadSet$UploadCompletedEvent } from "sap/m/upload/UploadSet";
import UploadSetItem, { UploadSetItem$OpenPressedEvent } from "sap/m/upload/UploadSetItem";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import Item from "sap/ui/core/Item";
import deepEqual from "sap/base/util/deepEqual";

/**
 * @namespace com.logaligroup.employees.controller
 */

export default class OrderDetails extends BaseController {

    public onInit () : void {
        const router = this.getRouter();
            router.getRoute("RouteOrderDetails")?.attachPatternMatched(this.onObjectMatched.bind(this));
    }

    private onObjectMatched( event: Route$PatternMatchedEvent) : void {
        const viewModel = this.getModel("view") as JSONModel;
            viewModel.setProperty("/layout","EndColumnFullScreen");
        
        const args = event.getParameter("arguments") as any;
        const orderId = args.OrderId;
        const view = this.getView();
        const $this = this;

        view?.bindElement({
            path: "/Orders("+orderId+")",
            model: 'northwind',
            events: {
                change: function() {
                    $this.onClearPress();
                    $this.onRefreshPress();
                    $this.onSearchFiles();
                }
            }
        });
    }

    public onClearPress () : void {
        try {
            const oSignaturePad = this.byId("signature") as Signature;
            oSignaturePad.clear();
        } catch (err) {
            console.log("El control aun no ha sido renderizado");
        }
    }

    public async onSavePress(): Promise<void> {
        const oSignaturePad = this.byId("signature") as Signature;
        const resourceBundle = this.getResourceBundle();
        const bindingContext = this.getView()?.getBindingContext("northwind") as Context;
        const utils = new Utils(this);

        if(!oSignaturePad.isFill()){
            MessageBox.error(resourceBundle.getText("fillSignature")||'No text defined');
        }else{
            const sMediaContent = oSignaturePad.getSignature().replace("data:image/png;base64,","");
            
            const body = {
                url: "/SignatureSet",
                data: {
                    OrderId: (bindingContext.getProperty("OrderID")).toString(),
                    SapId: utils.getEmail(),
                    EmployeeId: (bindingContext.getProperty("EmployeeID")).toString(),
                    MimeType:'image/png',
                    MediaContent: sMediaContent
                }
            }
            await utils.crud('create', new JSONModel(body));
            this.read();
        }
    }

    public async read(): Promise<void | ODataListBinding> {
        const oBindingContext = this.getView()?.getBindingContext("northwind") as Context;
        const utils = new Utils(this);
        const sOrderId = (oBindingContext.getProperty("OrderID")).toString();
        const sSapId = utils.getEmail();
        const sEmployeeId= (oBindingContext.getProperty("EmployeeID")).toString();

        const body = {
            url: "/SignatureSet",
            filters: [
                new Filter("OrderId", "EQ", sOrderId),
                new Filter("SapId", "EQ", sSapId),
                new Filter("EmployeeId", "EQ", sEmployeeId)
            ]
        }
        return await utils.read(new JSONModel(body));
    }
    
    private showSignature(data: void | ODataListBinding) : void {
        let object = data as any;
        let sMediaContent = object.results[0].MediaContent;
        const oSignature = this.byId("signature") as Signature;
        oSignature.setSignature("data:image/png;base64," + sMediaContent);
    }

    public async onRefreshPress() : Promise<void> {
        const results = await this.read();
        this.showSignature(results);
    }

    public  onBeforeUpload(event: UploadSet$BeforeUploadStartsEvent) : void {
        const item = event.getParameter("item") as UploadSetItem;
        const utils = new Utils(this);
        const bindingContext = this.getView()?.getBindingContext("northwind");

        const orderId = bindingContext?.getProperty("OrderID").toString();
        const sapId = utils.getEmail();
        const employeeId = bindingContext?.getProperty("EmployeeID").toString();
        const fileName = item.getFileName();

        //no es necesario añadir el media type en el slug 
        const mediaType = item.getMediaType();

        const slug = `${orderId};${sapId};${employeeId};${fileName}`;

        const model = this.getModel("zincidence") as ODataModel;
        const token = model.getSecurityToken(); 

        console.log(slug);
        console.log(token);

        const addHeaderSlug = new Item({
            key: 'slug',
            text: slug
        });
        const addHeaderToken = new Item({
            key: 'x-csrf-token',
            text: token
        })

        item.addHeaderField(addHeaderSlug);
        item.addHeaderField(addHeaderToken);
    }

    public onUploadCompleted(event: UploadSet$UploadCompletedEvent) : void {
        const uploadSet = event.getSource(); //this.byId("upload")
        uploadSet.getBinding("items")?.refresh();
    }

    public onSearchFiles() : void {
        const utils = new Utils(this);
        const bindingContext = this.getView()?.getBindingContext("northwind");
        const orderId = bindingContext?.getProperty("OrderID").toString();
        const sapId = utils.getEmail();
        const employeeId = bindingContext?.getProperty("EmployeeID");

        const oUploadSet = this.byId("upload");
        oUploadSet?.bindAggregation("items", {
            path: 'zincidence>/FilesSet',
            filters: [
                new Filter ("OrderId", "EQ", orderId),
                new Filter ("SapId", "EQ", sapId),
                new Filter ("EmployeeId", "EQ", employeeId),
            ],
            template: new UploadSetItem ({
                fileName: "{zincidence>FileName}",
                mediaType: "{zincidence>MimeType}",
                visibleEdit: false,
                url: "/",
                openPressed: this.onOpenPress.bind(this)
            })
        });

    }

    public async onAfterItemDelete(event: UploadSet$AfterItemRemovedEvent): Promise<void> {
        const item = event.getParameter("item") as UploadSetItem;
        const bindingContext = item.getBindingContext("zincidence") as Context;
        const sPath = bindingContext.getPath() as string;
        const body = {
            url: sPath
        }
        const utils = new Utils(this);
        await utils.crud('delete', new JSONModel(body));
        item.getBinding("items")?.refresh();
    }

    public onOpenPress(event: UploadSetItem$OpenPressedEvent): void {
        const item = event.getParameter("item") as UploadSetItem;
        const bindingContext = item?.getBindingContext("zincidence") as Context;
        const sPath = bindingContext.getPath();
        let url = "/sap/opu/odata/sap/YSAPUI5_SRV_01" + sPath + "/$value";
        item.setUrl(url);
    }

}