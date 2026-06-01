export class ApiResponse<T> {
   code:number
   message:string
   data?:T
   
   constructor(code:number,message:string,data?:T){
    this.code=code
    this.message=message
    this.data=data
   }
 // 成功响应
   static success<T>(code:number = 0,message:string = '操作成功',data?:T):ApiResponse<T>{
    return new ApiResponse<T>(code,message,data)
   }
 // 失败响应
   static error<T>(code:number = 1,message:string = '操作失败',data?:T):ApiResponse<T>{
    return new ApiResponse<T>(code,message,data)
   }
}