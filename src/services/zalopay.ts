import env from "@/env";
import {
  ZaloResult,
  ZaloClient,
  ZaloOrder,
  OrderItem,
} from "@/types/interfaces";
import axios from "axios";
import { createHmac } from "crypto";

// Sandbox env
class ZaloPay {
  private readonly client: ZaloClient;
  private orderID: number;

  constructor() {
    this.client = {
      app_id: env.ZALO_APP_ID,
      key1: env.ZALO_KEY1,
      key2: env.ZALO_KEY2,
      embed_data: {
        redirectUrl: "https://open.hustmusik.live",
      },
    };
    this.orderID = parseInt(Date.now().toString().slice(-6));
  }

  public createOrder = async (user_id: string, items: OrderItem[]) => {
    this.orderID++;
    const date = new Date();
    const order: ZaloOrder = {
      app_id: this.client.app_id,
      app_trans_id: `${date.getFullYear().toString().slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}_${this.orderID}`,
      app_user: user_id,
      app_time: Date.now(),
      item: JSON.stringify(items),
      embed_data: JSON.stringify(this.client.embed_data),
      amount: items.reduce(
        (acc, item) => acc + item.itemprice * item.itemquantity,
        0,
      ),
      description: `Hust Musik Premium - Payment for order ${this.orderID}`,
      bank_code: "zalopayapp",
    };
    const data =
      this.client.app_id +
      "|" +
      order.app_trans_id +
      "|" +
      order.app_user +
      "|" +
      order.amount +
      "|" +
      order.app_time +
      "|" +
      order.embed_data +
      "|" +
      order.item;
    order.mac = createHmac("sha256", this.client.key1)
      .update(data)
      .digest("hex");

    const res = await axios.post(
      "https://sb-openapi.zalopay.vn/v2/create",
      null,
      { params: order },
    );
    return { ...res.data, app_trans_id: order.app_trans_id };
  };

  public receiveOrderCallback = (
    dataStr: string,
    reqMac: string,
  ): ZaloResult => {
    let result: ZaloResult;
    try {
      let mac = createHmac("sha256", this.client.key2)
        .update(dataStr)
        .digest("hex");

      if (reqMac !== mac) {
        result = {
          return_code: -1,
          return_message: "mac not equal",
        };
      } else {
        result = {
          return_code: 1,
          return_message: "success",
        };
      }
    } catch (err) {
      result = {
        return_code: 0,
        return_message: (err as any).message,
      };
    }
    return result;
  };

  public getOrderStatus = async (app_trans_id: string) => {
    const order: ZaloOrder = {
      app_id: this.client.app_id,
      app_trans_id: app_trans_id,
    };
    const data =
      order.app_id + "|" + order.app_trans_id + "|" + this.client.key1;
    order.mac = createHmac("sha256", this.client.key1)
      .update(data)
      .digest("hex");

    const config = {
      method: "post",
      url: "https://sb-openapi.zalopay.vn/v2/query",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: new URLSearchParams(Object.entries(order)).toString(),
      timeout: 5000,
    };

    try {
      const resp = await axios(config);
      return resp.data;
    } catch (error) {
      throw new Error(`Failed to retrieve order status: ${error}`);
    }
  };
}

const zalo = new ZaloPay();

export default zalo;
